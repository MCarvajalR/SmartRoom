"""
Servicio de recolección de telemetría.

Proporciona funciones para collecting datos de telemetría de todos
los dispositivos activos desde Home Assistant y persistirlos en la BD.

Este servicio es utilizado por:
- El scheduler (tareas periódicas cada TELEMETRY_INTERVAL_SECONDS)
- El endpoint manual de recolección (/api/v1/telemetry/collect)
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.services import energy_simulator, ha_client

logger = logging.getLogger(__name__)


def _parse_value(raw: str) -> float | None:
    """
    Convierte el estado textual a número.
    
    Args:
        raw: Estado textual del dispositivo (ej: "25.5", "on", "off")
    
    Returns:
        float si el valor es numérico, None otherwise
    """
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


async def collect_all(db: AsyncSession | None = None) -> int:
    """
    Recorre todos los dispositivos activos, obtiene su estado
    desde Home Assistant y persiste un TelemetryRecord.
    
    Args:
        db: Sesión de BD opcional. Si es None, se crea una nueva.
    
    Returns:
        Cantidad de registros guardados exitosamente
    
    Proceso:
        1. Obtiene todos los dispositivos con is_active=True
        2. Ejecuta requests en paralelo a HA para obtener estados
        3. Por cada estado válido, crea un TelemetryRecord
        4. Commit de todos los registros
    """
    own_session = db is None
    if own_session:
        db = AsyncSessionLocal()

    saved = 0
    try:
        # Obtener todos los dispositivos activos
        result = await db.execute(select(Device).where(Device.is_active == True))
        devices = result.scalars().all()

        # Request paralelo a HA para todos los dispositivos
        tasks = [
            (
                energy_simulator.get_state()
                if device.entity_id == energy_simulator.ENTITY_ID
                else ha_client.get_state(device.entity_id)
            )
            for device in devices
        ]
        states_data = await asyncio.gather(*tasks)

        # Crear registros de telemetría
        for device, state_data in zip(devices, states_data):
            if state_data is None:
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
