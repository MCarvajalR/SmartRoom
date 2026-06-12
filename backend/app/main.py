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
from sqlalchemy import select, text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal, Base, engine
from app.core.security import hash_password
from app.models import Device, Settings, User
from app.services import ha_client, telemetry_service
from app.services.area_service import ensure_local_areas
from app.services.energy_simulator import ensure_energy_simulator
from app.services.device_sync import sync_devices_from_ha
from app.services.ha_websocket import start_ha_listener
from app.services.scheduler import scheduler

# Configurar logging con formato legible
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


async def ensure_database_indexes() -> None:
    """
    Crea índices operativos que aceleran consultas frecuentes.

    create_all no siempre añade índices nuevos sobre tablas ya existentes,
    por eso los aseguramos explícitamente al iniciar la aplicación.
    """
    statements = (
        """
        CREATE INDEX IF NOT EXISTS ix_telemetry_records_recorded_at_desc
        ON telemetry_records (recorded_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_telemetry_records_device_recorded_at_desc
        ON telemetry_records (device_id, recorded_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_devices_active_visibility_id
        ON devices (is_active, visibility, id)
        """,
    )

    async with engine.begin() as conn:
        for statement in statements:
            await conn.execute(text(statement))


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

    await ensure_database_indexes()
    logger.info("Índices operativos verificados/creados.")

    # 2. Crear usuario admin por defecto si no existe
    telemetry_interval_seconds = settings.TELEMETRY_INTERVAL_SECONDS
    async with AsyncSessionLocal() as db:
        suggested_area_names = {}
        try:
            suggested_area_names = {
                area["area_id"]: area["name"]
                for area in await ha_client.get_areas()
                if area.get("area_id") and area.get("name")
            }
        except Exception:
            logger.warning("Home Assistant no disponible para importar nombres iniciales de areas.")

        device_areas = await db.execute(
            select(Device.area_id).where(Device.area_id.is_not(None)).distinct()
        )
        await ensure_local_areas(
            db,
            {row[0] for row in device_areas.fetchall() if row[0]},
            suggested_area_names,
        )
        await db.commit()

        result = await db.execute(select(User).where(User.username == "admin"))
        admin_user = result.scalar_one_or_none()
        if not admin_user:
            db.add(
                User(
                    username="admin",
                    email="admin@unicauca.edu.co",
                    hashed_password=hash_password("admin123"),
                    role="admin",
                )
            )
            await db.commit()
            logger.info("Usuario admin creado (admin / admin123)")
        elif admin_user.email == "admin@smartroom.local":
            admin_user.email = "admin@unicauca.edu.co"
            await db.commit()
            logger.info("Correo del administrador inicial normalizado al dominio institucional.")

        simulator = await ensure_energy_simulator(db)
        logger.info("Simulador energético verificado: %s", simulator.entity_id)

        settings_result = await db.execute(select(Settings).where(Settings.id == 1))
        system_settings = settings_result.scalar_one_or_none()
        if system_settings:
            telemetry_interval_seconds = system_settings.telemetry_interval_seconds
        else:
            db.add(
                Settings(
                    id=1,
                    telemetry_interval_seconds=telemetry_interval_seconds,
                )
            )
            await db.commit()

    # 3. Configurar scheduler con jobs periódicos
    scheduler.add_job(
        telemetry_service.collect_all,
        "interval",
        seconds=telemetry_interval_seconds,
        id="collect_telemetry",
        replace_existing=True,
    )

    scheduler.add_job(
        run_device_sync,
        "interval",
        seconds=telemetry_interval_seconds,
        id="sync_devices_from_ha",
        replace_existing=True,
    )

    # 4. Iniciar scheduler
    scheduler.start()
    logger.info(
        "Scheduler iniciado: telemetría y sync de dispositivos cada %ds.",
        telemetry_interval_seconds,
    )

    # 5. Sincronización inicial
    await run_device_sync()
    imported = await telemetry_service.backfill_from_home_assistant()
    logger.info("Backfill inicial desde Home Assistant: %d registros importados.", imported)
    await asyncio.sleep(2)  # Pequeño delay para asegurar sincronización

    # 6. Iniciar listener de WebSocket de HA en background
    ha_task = asyncio.create_task(start_ha_listener())
    logger.info("Listener de Home Assistant iniciado en background.")

    # Mantener la aplicación corriendo
    try:
        yield
    finally:
        # Cleanup al cerrar
        if ha_task:
            ha_task.cancel()
        try:
            if ha_task:
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
