"""
Punto de entrada de la aplicación FastAPI.

Inicializa la base de datos, crea el usuario admin, configura el scheduler
de telemetría, descubre dispositivos de Home Assistant e inicia el
listener de WebSocket en background.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal, Base, engine
from app.core.security import hash_password
from app.models import Device, User
from app.services import telemetry_service
from app.services.ha_websocket import start_ha_listener

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

EXCLUDED_PREFIXES = (
    "person.", "zone.", "sun.", "weather.", "tts.",
    "todo.", "conversation.", "event.", "sensor.backup_",
    "sensor.sun_", "update.",
)

TYPE_MAP = {
    "temperature": "temperature",
    "humidity": "humidity",
    "power": "plug",
    "energy": "plug",
    "lock": "lock",
    "illuminance": "light",
    "motion": "binary_sensor",
}


async def discover_ha_devices() -> None:
    """Sincroniza dispositivos existentes de Home Assistant con la base de datos."""
    headers = {"Authorization": f"Bearer {settings.HA_TOKEN}"}
    url = f"{settings.HA_URL}/api/states"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10)
            if response.status_code != 200:
                logger.warning("No se pudo obtener estados de HA: %s", response.status_code)
                return

            states = response.json()
            registered = 0

            async with AsyncSessionLocal() as db:
                for state in states:
                    entity_id = state.get("entity_id", "")
                    if any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):
                        continue

                    attrs = state.get("attributes", {})
                    result = await db.execute(select(Device).where(Device.entity_id == entity_id))
                    if result.scalar_one_or_none():
                        continue

                    device = Device(
                        entity_id=entity_id,
                        name=attrs.get("friendly_name", entity_id),
                        device_type=TYPE_MAP.get(attrs.get("device_class", ""), entity_id.split(".")[0]),
                        unit=attrs.get("unit_of_measurement"),
                        visibility="public",
                        is_active=True,
                    )
                    try:
                        db.add(device)
                        await db.commit()
                        registered += 1
                    except IntegrityError:
                        await db.rollback()

            logger.info("Descubrimiento HA: %d dispositivos nuevos registrados.", registered)
    except Exception as e:
        logger.warning("Error en descubrimiento inicial de HA: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida completo de la aplicación."""
    logger.info("Iniciando SmartRoom Backend...")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tablas verificadas/creadas.")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            db.add(User(
                username="admin",
                email="admin@smartroom.local",
                hashed_password=hash_password("admin123"),
                role="admin",
            ))
            await db.commit()
            logger.info("Usuario admin creado (admin / admin123)")

    scheduler.add_job(
        telemetry_service.collect_all,
        "interval",
        seconds=settings.TELEMETRY_INTERVAL_SECONDS,
        id="collect_telemetry",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Colector de telemetría iniciado (cada %ds).", settings.TELEMETRY_INTERVAL_SECONDS)

    await discover_ha_devices()
    await asyncio.sleep(2)

    ha_task = asyncio.create_task(start_ha_listener())
    logger.info("Listener de Home Assistant iniciado en background.")

    yield

    ha_task.cancel()
    try:
        await ha_task
    except asyncio.CancelledError:
        pass
    scheduler.shutdown(wait=False)
    await engine.dispose()
    logger.info("Backend detenido.")


app = FastAPI(
    title="SmartRoom — Laboratorio Inteligente API",
    version="2.0.0",
    description="Backend para monitoreo IoT con Home Assistant",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/", tags=["Root"])
async def root():
    return {"message": "SmartRoom API v2.0 — visita /docs para la documentación"}