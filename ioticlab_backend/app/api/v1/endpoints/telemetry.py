"""
Endpoints de telemetría.

Proporciona acceso a los datos de los sensores:
- Último valor de cada sensor (público)
- Historial de telemetría (público)
- Disparo manual de recolección (solo admin)
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, get_optional_user, get_visible_levels, require_roles
from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.models.user import User
from app.schemas.telemetry import TelemetryLatest, TelemetryResponse
from app.services import telemetry_service

router = APIRouter(prefix="/telemetry", tags=["Telemetría"])


@router.get("/latest", response_model=list[TelemetryLatest])
async def get_latest(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Retorna el último valor de cada sensor activo visible para el usuario."""
    levels = get_visible_levels(current_user)
    result = await db.execute(select(Device).where(Device.is_active == True, Device.visibility.in_(levels)))
    devices = result.scalars().all()

    output = []
    for device in devices:
        rec_result = await db.execute(
            select(TelemetryRecord)
            .where(TelemetryRecord.device_id == device.id)
            .order_by(desc(TelemetryRecord.recorded_at))
            .limit(1)
        )
        rec = rec_result.scalar_one_or_none()
        output.append(
            TelemetryLatest(
                device_id=device.id,
                entity_id=device.entity_id,
                device_name=device.name,
                device_type=device.device_type,
                unit=device.unit,
                value=rec.value if rec else None,
                raw_state=rec.raw_state if rec else "sin datos",
                recorded_at=rec.recorded_at if rec else None,
            )
        )
    return output


@router.get("/history", response_model=list[TelemetryResponse])
async def get_history(
    device_id: int | None = Query(None),
    limit: int = Query(100, le=1000),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Retorna el historial de telemetría con filtros opcionales."""
    levels = get_visible_levels(current_user)

    query = (
        select(TelemetryRecord, Device)
        .join(Device, TelemetryRecord.device_id == Device.id)
        .order_by(desc(TelemetryRecord.recorded_at))
    )
    if device_id:
        query = query.where(TelemetryRecord.device_id == device_id)
    if start:
        query = query.where(TelemetryRecord.recorded_at >= start)
    if end:
        query = query.where(TelemetryRecord.recorded_at <= end)
    query = query.limit(limit)

    result = await db.execute(select(Device).where(Device.is_active == True, Device.visibility.in_(levels)))
    rows = result.all()

    return [
        TelemetryResponse(
            id=rec.id,
            device_id=rec.device_id,
            entity_id=device.entity_id,
            device_name=device.name,
            value=rec.value,
            raw_state=rec.raw_state,
            recorded_at=rec.recorded_at,
        )
        for rec, device in rows
    ]


@router.post("/collect", status_code=200)
async def manual_collect(_: User = Depends(require_roles("admin"))):
    """Dispara manualmente la recolección de telemetría. Solo admins."""
    saved = await telemetry_service.collect_all()
    return {"message": f"Recolección completada: {saved} registros guardados"}