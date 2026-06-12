"""Automatic retention cleanup for telemetry history."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.settings import Settings
from app.models.telemetry import TelemetryRecord

logger = logging.getLogger(__name__)


async def delete_expired_records(db: AsyncSession, retention_days: int) -> int:
    """Delete every telemetry record older than the configured retention."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        delete(TelemetryRecord).where(TelemetryRecord.recorded_at < cutoff)
    )
    remaining_result = await db.execute(
        select(func.count(TelemetryRecord.id)).where(TelemetryRecord.recorded_at < cutoff)
    )
    remaining = remaining_result.scalar_one()
    if remaining:
        raise RuntimeError(
            f"La limpieza no se completo: quedan {remaining} registros anteriores al limite."
        )
    return max(result.rowcount or 0, 0)


async def run_scheduled_cleanup() -> int:
    """Apply the persisted retention policy and commit the deletion."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Settings).where(Settings.id == 1))
        system_settings = result.scalar_one_or_none()
        if not system_settings or not system_settings.telemetry_retention_enabled:
            logger.info("Limpieza de historial omitida: retencion automatica no activada.")
            return 0
        retention_days = system_settings.telemetry_retention_days if system_settings else 30
        deleted = await delete_expired_records(db, retention_days)
        await db.commit()
        logger.info(
            "Limpieza de historial completada: %d registros eliminados, retencion %d dias.",
            deleted,
            retention_days,
        )
        return deleted
