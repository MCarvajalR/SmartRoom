"""
Simulador de consumo energético para desarrollo local.

El dispositivo se identifica explícitamente como simulador y puede
reemplazarse por un sensor real de Home Assistant sin cambiar la vista.
"""

import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.services.area_service import ensure_local_areas

ENTITY_ID = "simulator.power_laboratorio"
DEVICE_NAME = "Consumo energético del laboratorio (Simulado)"


def power_value_at(moment: datetime) -> float:
    """Genera una carga realista en vatios según la hora del día."""
    hour = moment.hour + moment.minute / 60
    occupied = 7.5 <= hour <= 19.5
    base = 420 if occupied else 85
    work_cycle = 210 * max(0, math.sin((hour - 7.5) * math.pi / 5)) if occupied else 0
    equipment_cycle = 95 * math.sin(moment.timestamp() / 2100)
    short_cycle = 35 * math.sin(moment.timestamp() / 420)
    return round(max(45, base + work_cycle + equipment_cycle + short_cycle), 1)


async def get_state() -> dict:
    value = power_value_at(datetime.now(timezone.utc))
    return {
        "entity_id": ENTITY_ID,
        "state": str(value),
        "attributes": {
            "friendly_name": DEVICE_NAME,
            "device_class": "power",
            "unit_of_measurement": "W",
            "simulated": True,
        },
    }


async def ensure_energy_simulator(db: AsyncSession) -> Device:
    """Crea el dispositivo y un historial inicial si todavía no existen."""
    await ensure_local_areas(db, {"laboratorio"}, {"laboratorio": "Laboratorio"})
    result = await db.execute(select(Device).where(Device.entity_id == ENTITY_ID))
    device = result.scalar_one_or_none()

    if not device:
        device = Device(
            entity_id=ENTITY_ID,
            name=DEVICE_NAME,
            device_type="power",
            unit="W",
            area_id="laboratorio",
            visibility="public",
            is_active=True,
        )
        db.add(device)
        await db.flush()

    count_result = await db.execute(
        select(func.count(TelemetryRecord.id)).where(TelemetryRecord.device_id == device.id)
    )
    record_count = count_result.scalar_one()

    if record_count == 0:
        now = datetime.now(timezone.utc).replace(second=13, microsecond=0)
        for step in range(96, 0, -1):
            recorded_at = now - timedelta(minutes=15 * step)
            value = power_value_at(recorded_at)
            db.add(
                TelemetryRecord(
                    device_id=device.id,
                    value=value,
                    raw_state=str(value),
                    recorded_at=recorded_at,
                )
            )

    await db.commit()
    await db.refresh(device)
    return device
