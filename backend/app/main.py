"""
Punto de entrada de la aplicación FastAPI.

Inicializa y configura todos los componentes del backend:
- Base de datos (creación de tablas)
- Usuario administrador por defecto
- Scheduler para tareas periódicas (telemetría y sync)
- Sincronización inicial de dispositivos
- Listener de WebSocket para Home Assistant

Este módulo usa el lifecycle management de FastAPI para ejecutar
código al iniciar y al cerrar la aplicación.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal, Base, engine
from app.core.security import hash_password
from app.models import Settings, User
from app.services import telemetry_service
from app.services.device_sync import sync_devices_from_ha
from app.services.ha_websocket import start_ha_listener
from app.services.scheduler import scheduler

# Configurar logging con formato legible
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


async def run_device_sync() -> None:
    """
    Ejecuta la sincronización de dispositivos desde Home Assistant.
    
    Se llama durante el startup para cargar los dispositivos iniciales.
    """
    async with AsyncSessionLocal() as db:
        result = await sync_devices_from_ha(db)
        logger.info("Sincronización HA completada: %s", result)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestiona el ciclo de vida completo de la aplicación.
    
    Al iniciar:
    1. Crea las tablas de la base de datos si no existen
    2. Crea el usuario admin por defecto (admin/admin123)
    3. Configura el scheduler con jobs de telemetría y sync
    4. Inicia el scheduler
    5. Ejecuta sincronización inicial de dispositivos
    6. Inicia el listener de WebSocket de HA en background
    
    Al cerrar:
    1. Cancela la tarea del listener de WebSocket
    2. Apaga el scheduler
    3. Cierra las conexiones de la base de datos
    """
    logger.info("Iniciando SmartRoom Backend...")

    # 1. Crear tablas en la base de datos
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tablas verificadas/creadas.")

    # 2. Crear usuario admin por defecto si no existe
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            db.add(
                User(
                    username="admin",
                    email="admin@smartroom.local",
                    hashed_password=hash_password("admin123"),
                    role="admin",
                )
            )
            await db.commit()
            logger.info("Usuario admin creado (admin / admin123)")

    # 3. Configurar scheduler con jobs periódicos
    scheduler.add_job(
        telemetry_service.collect_all,
        "interval",
        seconds=settings.TELEMETRY_INTERVAL_SECONDS,
        id="collect_telemetry",
        replace_existing=True,
    )

    scheduler.add_job(
        run_device_sync,
        "interval",
        seconds=settings.TELEMETRY_INTERVAL_SECONDS,
        id="sync_devices_from_ha",
        replace_existing=True,
    )

    # 4. Iniciar scheduler
    scheduler.start()
    logger.info(
        "Scheduler iniciado: telemetría y sync de dispositivos cada %ds.",
        settings.TELEMETRY_INTERVAL_SECONDS,
    )

    # 5. Sincronización inicial
    await run_device_sync()
    await asyncio.sleep(2)  # Pequeño delay para asegurar sincronización

    # 6. Iniciar listener de WebSocket de HA en background
    ha_task = asyncio.create_task(start_ha_listener())
    logger.info("Listener de Home Assistant iniciado en background.")

    # Mantener la aplicación corriendo
    try:
        yield
    finally:
        # Cleanup al cerrar
        ha_task.cancel()
        try:
            await ha_task
        except asyncio.CancelledError:
            pass

        scheduler.shutdown(wait=False)
        await engine.dispose()
        logger.info("Backend detenido.")


# Crear aplicación FastAPI con configuración
app = FastAPI(
    title="SmartRoom — Laboratorio Inteligente API",
    version="2.0.0",
    description="Backend para monitoreo IoT con Home Assistant. Proporciona API REST para gestión de dispositivos, telemetría en tiempo real y control de acceso.",
    lifespan=lifespan,
    docs_url="/docs",           # Swagger UI en /docs
    redoc_url="/redoc",         # ReDoc en /redoc
    openapi_url="/openapi.json",
)

# Configurar CORS para permitir requests desde el frontend Angular
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Para un entorno de laboratorio controlado, esto es lo más eficiente
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|100\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|[a-zA-Z0-9-]+\.ts\.net)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir todos los routers de endpoints
app.include_router(api_router)


@app.get("/", tags=["Root"])
async def root():
    """
    Endpoint raíz de la API.
    
    Returns:
        Mensaje de bienvenida con versión de la API
    """
    return {"message": "SmartRoom API v2.0 — visita /docs para la documentación"}
