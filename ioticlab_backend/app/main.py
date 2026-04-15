import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.security import hash_password
from app.models import AccessLog, Device, TelemetryRecord, User  # noqa: F401 — necesario para create_all
from app.services import telemetry_service

# Para traer datos del homeassistant en tiempo real
import asyncio
from app.services.ha_websocket import start_ha_listener
from app.api.v1.endpoints.ws import router as ws_router
from app.api.v1.endpoints.discover import router as discover_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DAMBA — Laboratorio Inteligente API",
    version="2.0.0",
    description="Backend para monitoreo IoT con Home Assistant",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rutas ────────────────────────────────────────────────────────────────────
app.include_router(api_router)

# ─── Scheduler ────────────────────────────────────────────────────────────────
scheduler = AsyncIOScheduler()

# Función para consultar todos los dispositivos que se han registrado en HA
async def discover_ha_devices() -> None:
    """Al arrancar, sincroniza todos los estados de HA con la DB."""
    import httpx
    from app.core.database import AsyncSessionLocal
    from app.models.device import Device
    from sqlalchemy.exc import IntegrityError

    headers = {"Authorization": f"Bearer {settings.HA_TOKEN}"}
    url = f"{settings.HA_URL}/api/states"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10)
            if response.status_code != 200:
                logger.warning(f"No se pudo obtener estados de HA: {response.status_code}")
                return

            states = response.json()
            registered = 0

            type_map = {
                "temperature": "temperature", "humidity": "humidity",
                "power": "plug", "energy": "plug", "lock": "lock",
                "illuminance": "light", "motion": "binary_sensor",
            }

            # Prefijos que no son dispositivos IoT reales
            EXCLUDED_PREFIXES = (
                "person.", "zone.", "sun.", "weather.", "tts.",
                "todo.", "conversation.", "event.", "sensor.backup_",
                "sensor.sun_", "update.",
            )

            async with AsyncSessionLocal() as db:
                for state in states:
                    entity_id = state.get("entity_id", "")
                    
                    # Filtrar entidades que no son dispositivos IoT reales
                    if any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):
                        continue
                    
                    attrs = state.get("attributes", {})
                    result = await db.execute(
                        select(Device).where(Device.entity_id == entity_id)
                    )
                    if result.scalar_one_or_none():
                        continue  # ya existe, saltar

                    device_class = attrs.get("device_class", "")
                    unit = attrs.get("unit_of_measurement")
                    device_type = type_map.get(device_class, entity_id.split(".")[0])

                    device = Device(
                        entity_id   = entity_id,
                        name        = attrs.get("friendly_name", entity_id),
                        device_type = device_type,
                        unit        = unit,
                        visibility  = "public",
                        is_active   = True,
                    )
                    try:
                        db.add(device)
                        await db.commit()
                        registered += 1
                    except IntegrityError:
                        await db.rollback()

            logger.info(f"Descubrimiento HA: {registered} dispositivos nuevos registrados.")

    except Exception as e:
        logger.warning(f"Error en descubrimiento inicial de HA: {e}")


# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("Iniciando DAMBA Backend v2.0 ...")
    
    # 1. Crear tablas
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tablas verificadas/creadas.")

    # 2. Seed: usuario admin por defecto
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(
                username="admin",
                email="admin@damba.local",
                hashed_password=hash_password("admin123"),
                role="admin",
            )
            db.add(admin)
            await db.commit()
            logger.info("Usuario admin creado (admin / admin123) — CAMBIAR EN PRODUCCIÓN.")

        """ # 3. Seed: dispositivos por defecto
        result = await db.execute(select(Device))
        if not result.scalars().first():
            default_devices = [
                Device(
                    entity_id="sensor.snzb02d_temperature",
                    name="Temperatura Laboratorio",
                    device_type="temperature",
                    visibility="public",
                    unit="°C",
                ),
                Device(
                    entity_id="sensor.snzb02d_humidity",
                    name="Humedad Laboratorio",
                    device_type="humidity",
                    visibility="public",
                    unit="%",
                ),
                Device(
                    entity_id="switch.neo_zwave_plug_1",
                    name="Toma Corriente Neo Z-Wave",
                    device_type="plug",
                    visibility="docente",
                    unit=None,
                ),
            ]
            for d in default_devices:
                db.add(d)
            await db.commit()
            logger.info("3 dispositivos por defecto registrados.") """

    # 4. Iniciar colector automático de telemetría
    scheduler.add_job(
        telemetry_service.collect_all,
        "interval",
        seconds=settings.TELEMETRY_INTERVAL_SECONDS,
        id="collect_telemetry",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Colector de telemetría iniciado (cada %ds).",
        settings.TELEMETRY_INTERVAL_SECONDS,
    )
    # Descubrir dispositivos existentes en HA al arrancar
    await discover_ha_devices()
    
    # Dar tiempo al pool de DB para estabilizarse
    await asyncio.sleep(2)
    
    # Iniciar listener de HA en tiempo real
    asyncio.create_task(start_ha_listener())
    logger.info("Listener de Home Assistant iniciado en background.")    


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
    await engine.dispose()
    logger.info("Backend detenido.")


@app.get("/", tags=["Root"])
async def root():
    return {"message": "DAMBA API v2.0 — visita /docs para la documentación"}

""" @asynccontextmanager
async def lifespan(app: FastAPI):
    # ... tu código existente de startup (migraciones, etc.) ...

    # NUEVO: iniciar listener de HA en background
    ha_task = asyncio.create_task(start_ha_listener())

    yield  # la app corre aquí

    # NUEVO: cancelar la tarea al apagar
    ha_task.cancel()
    try:
        await ha_task
    except asyncio.CancelledError:
        pass """