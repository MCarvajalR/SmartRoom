"""
Colector de telemetría: consulta HA por cada dispositivo activo
y guarda el resultado en la base de datos.
"""
import logging
import asyncio # <--- Asegúrate de importar esto

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.services import ha_client

logger = logging.getLogger(__name__)


def _parse_value(raw: str) -> float | None:
    """Intenta convertir el estado crudo a float."""
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


async def collect_all(db: AsyncSession | None = None) -> int:
    """
    Recorre todos los dispositivos activos, obtiene su estado
    desde Home Assistant y persiste un TelemetryRecord.
    Retorna la cantidad de registros guardados.
    """
    own_session = db is None
    if own_session:
        db = AsyncSessionLocal()

    saved = 0
    try:
        result = await db.execute(select(Device).where(Device.is_active == True))
        devices = result.scalars().all()

        # RIGOR TÉCNICO: Ejecución en paralelo
        # Creamos una lista de tareas (tasks)
        tasks = [ha_client.get_state(device.entity_id) for device in devices]

        # asyncio.gather lanza todas las peticiones a la vez
        states_data = await asyncio.gather(*tasks)

        saved = 0
        # state_data_list = await asyncio.gather(*tasks, return_exceptions=True)
        for device, state_data in zip(devices, states_data):
            if state_data is None:
                #logger.warning("No se pudo obtener estado de %s", device.entity_id)
                continue

            raw_state: str = state_data.get("state", "unknown")
            value = _parse_value(raw_state)

            record = TelemetryRecord(
                device_id=device.id,
                value=value,
                raw_state=raw_state,
            )
            db.add(record)
            saved += 1

        await db.commit()
        logger.info("Telemetría recolectada: %d registros", saved)
    except Exception as exc:
        logger.error("Error en collect_all: %s", exc)
        await db.rollback()
    finally:
        if own_session:
            await db.close()

    return saved
