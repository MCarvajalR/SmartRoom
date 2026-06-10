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
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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


def _parse_ha_timestamp(raw: str | None) -> datetime | None:
    if not raw:
        return None

    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _clean_raw_state(raw: object) -> str:
    return str(raw)[:50]


def _history_record_for_device(device: Device, state: dict) -> tuple[datetime, str, float | None] | None:
    virtual_attribute = ha_client.parse_attribute_entity_id(device.entity_id)

    if virtual_attribute:
        _, attribute = virtual_attribute
        attrs = state.get("attributes") or {}
        raw_value = attrs.get(attribute)
        if raw_value is None:
            return None
    else:
        raw_value = state.get("state")

    raw_state = _clean_raw_state(raw_value)
    if raw_state.lower() in ("", "unknown", "unavailable", "none"):
        return None

    recorded_at = _parse_ha_timestamp(state.get("last_updated") or state.get("last_changed"))
    if not recorded_at:
        return None

    return recorded_at, raw_state, _parse_value(raw_state)


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


async def backfill_from_home_assistant(db: AsyncSession | None = None) -> int:
    """
    Importa historial previo desde Home Assistant hacia la BD local.

    La importacion es incremental: para cada dispositivo activo arranca desde
    su ultimo registro local, o desde HA_HISTORY_BACKFILL_DAYS si no tiene
    datos. Esto evita tocar configuracion remota y mantiene cada entorno aislado
    por su propio HA_URL/HA_TOKEN.
    """
    if not settings.HA_HISTORY_BACKFILL_ENABLED:
        logger.info("Backfill HA desactivado por configuracion.")
        return 0

    own_session = db is None
    if own_session:
        db = AsyncSessionLocal()

    saved = 0
    now = datetime.now(timezone.utc)
    initial_start = now - timedelta(days=max(settings.HA_HISTORY_BACKFILL_DAYS, 1))
    chunk_hours = max(settings.HA_HISTORY_BACKFILL_CHUNK_HOURS, 1)
    overlap = timedelta(minutes=2)

    try:
        result = await db.execute(select(Device).where(Device.is_active == True))
        devices = [
            device
            for device in result.scalars().all()
            if device.entity_id != energy_simulator.ENTITY_ID
        ]

        logger.info(
            "Iniciando backfill HA para %d dispositivos activos (%d dias max).",
            len(devices),
            settings.HA_HISTORY_BACKFILL_DAYS,
        )

        for device in devices:
            latest_result = await db.execute(
                select(func.max(TelemetryRecord.recorded_at))
                .where(TelemetryRecord.device_id == device.id)
            )
            latest_recorded_at = latest_result.scalar_one_or_none()
            if latest_recorded_at and latest_recorded_at.tzinfo is None:
                latest_recorded_at = latest_recorded_at.replace(tzinfo=timezone.utc)

            start = max(initial_start, latest_recorded_at - overlap) if latest_recorded_at else initial_start
            if start >= now:
                continue

            virtual_attribute = ha_client.parse_attribute_entity_id(device.entity_id)
            source_entity_id = virtual_attribute[0] if virtual_attribute else device.entity_id
            include_attributes = virtual_attribute is not None

            cursor = start
            while cursor < now:
                chunk_end = min(cursor + timedelta(hours=chunk_hours), now)
                history_groups = await ha_client.get_history(
                    [source_entity_id],
                    cursor,
                    chunk_end,
                    include_attributes=include_attributes,
                )

                candidate_records: list[tuple[datetime, str, float | None]] = []
                for group in history_groups:
                    if not isinstance(group, list):
                        continue
                    for state in group:
                        if not isinstance(state, dict):
                            continue
                        parsed = _history_record_for_device(device, state)
                        if parsed:
                            candidate_records.append(parsed)

                if candidate_records:
                    existing_result = await db.execute(
                        select(TelemetryRecord.recorded_at, TelemetryRecord.raw_state)
                        .where(TelemetryRecord.device_id == device.id)
                        .where(TelemetryRecord.recorded_at >= cursor)
                        .where(TelemetryRecord.recorded_at <= chunk_end)
                    )
                    existing = {
                        (
                            recorded_at.replace(tzinfo=timezone.utc) if recorded_at.tzinfo is None else recorded_at,
                            raw_state,
                        )
                        for recorded_at, raw_state in existing_result.all()
                    }

                    for recorded_at, raw_state, value in candidate_records:
                        key = (recorded_at, raw_state)
                        if key in existing:
                            continue

                        db.add(
                            TelemetryRecord(
                                device_id=device.id,
                                value=value,
                                raw_state=raw_state,
                                recorded_at=recorded_at,
                            )
                        )
                        existing.add(key)
                        saved += 1

                    await db.commit()

                cursor = chunk_end

        logger.info("Backfill HA completado: %d registros importados.", saved)
    except Exception as exc:
        logger.error("Error en backfill_from_home_assistant: %s", exc)
        await db.rollback()
    finally:
        if own_session:
            await db.close()

    return saved
