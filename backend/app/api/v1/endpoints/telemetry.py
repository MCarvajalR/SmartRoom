"""
Endpoints de telemetría.

Proporciona acceso a los datos de los sensores:
- Último valor de cada sensor (público, filtrado por visibilidad)
- Historial de telemetría con filtros (público, filtrado por visibilidad)
- Disparo manual de recolección (solo admin)

Los datos de telemetría son accesibles según la visibilidad del dispositivo:
- Dispositivos públicos: visibles para todos
- Dispositivos docente: visibles para docentes y admins
- Dispositivos admin/private: solo para admins
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, get_optional_user, get_visible_levels, require_roles
from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.models.user import User
from app.schemas.telemetry import TelemetryLatest, TelemetryResponse
from app.services import ha_client, telemetry_service, weather_service

router = APIRouter(prefix="/telemetry", tags=["Telemetría"])


@router.get("/weather-summary", response_model=dict)
async def get_weather_summary():
    return await ha_client.get_weather_summary()


@router.get("/outdoor-weather", response_model=dict)
async def get_outdoor_weather():
    return await weather_service.get_popayan_weather()


@router.get("/latest", response_model=list[TelemetryLatest])
async def get_latest(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Retorna el último valor de cada sensor activo visible para el usuario.
    
    Obtiene el registro de telemetría más reciente para cada dispositivo
    activo, detectando el tipo de dispositivo por el prefijo del entity_id.
    
    Returns:
        Lista de TelemetryLatest con el último valor de cada sensor
    """
    levels = get_visible_levels(current_user)
    result = await db.execute(select(Device).where(Device.is_active == True, Device.visibility.in_(levels)))
    devices = result.scalars().all()

    output = []
    for device in devices:
        # Obtener el último registro de telemetría
        rec_result = await db.execute(
            select(TelemetryRecord)
            .where(TelemetryRecord.device_id == device.id)
            .order_by(desc(TelemetryRecord.recorded_at))
            .limit(1)
        )
        rec = rec_result.scalar_one_or_none()
        
        # Detectar tipo de dispositivo por prefijo del entity_id
        device_type = device.device_type
        if device.entity_id.startswith("input_boolean."):
            device_type = "input_boolean"
        elif device.entity_id.startswith("lock."):
            device_type = "lock"
        elif device.entity_id.startswith("switch."):
            device_type = "switch"
        elif device.entity_id.startswith("binary_sensor."):
            device_type = "binary_sensor"
            
        output.append(
            TelemetryLatest(
                device_id=device.id,
                entity_id=device.entity_id,
                device_name=device.name,
                device_type=device_type,
                unit=device.unit,
                value=rec.value if rec else None,
                raw_state=rec.raw_state if rec else "sin datos",
                recorded_at=rec.recorded_at if rec else None,
            )
        )
    return output


@router.get("/history", response_model=list[TelemetryResponse])
async def get_history(
    device_id: Optional[int] = Query(None, description="ID del dispositivo a filtrar"),
    date: Optional[str] = Query(None, description="Fecha en formato YYYY-MM-DD"),
    hour: Optional[int] = Query(None, ge=0, le=23, description="Hora del día (0-23)"),
    limit: int = Query(100, le=1000, description="Cantidad máxima de registros"),
    offset: int = Query(0, ge=0, description="Offset para paginación"),
    start: Optional[datetime] = Query(None, description="Fecha/hora de inicio"),
    end: Optional[datetime] = Query(None, description="Fecha/hora de fin"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Retorna el historial de telemetría con filtros opcionales.
    
    Filtros disponibles:
    - device_id: Filtrar por dispositivo específico
    - date: Filtrar por fecha específica (YYYY-MM-DD)
    - hour: Filtrar por hora específica (0-23), requiere date
    - start/end: Filtrar por rango de fechas
    - limit/offset: Paginación
    
    Returns:
        Lista de registros de telemetría
    """
    levels = get_visible_levels(current_user)

    # Query base con join a Device para verificar visibilidad.
    # Cuando se filtra por dispositivo, el índice (device_id, recorded_at)
    # evita recorrer todo el historial.
    if device_id:
        query = (
            select(TelemetryRecord, Device)
            .join(Device, TelemetryRecord.device_id == Device.id)
            .where(Device.is_active.is_(True))
            .where(Device.visibility.in_(levels))
            .where(TelemetryRecord.device_id == device_id)
        )

        if start:
            query = query.where(TelemetryRecord.recorded_at >= start)
        if end:
            query = query.where(TelemetryRecord.recorded_at <= end)
    else:
        # Para "todos los dispositivos", primero se reduce el universo a los
        # últimos registros del rango y después se aplica visibilidad.
        recent_records = select(TelemetryRecord.id)

        if start:
            recent_records = recent_records.where(TelemetryRecord.recorded_at >= start)
        if end:
            recent_records = recent_records.where(TelemetryRecord.recorded_at <= end)

        recent_records = (
            recent_records
            .order_by(desc(TelemetryRecord.recorded_at))
            .limit(min(limit + offset + 100, 2000))
            .subquery()
        )

        query = (
            select(TelemetryRecord, Device)
            .join(recent_records, TelemetryRecord.id == recent_records.c.id)
            .join(Device, TelemetryRecord.device_id == Device.id)
            .where(Device.is_active.is_(True))
            .where(Device.visibility.in_(levels))
        )
    
    # Filtro por fecha (YYYY-MM-DD)
    if date:
        try:
            year, month, day = map(int, date.split('-'))
            date_start = datetime(year, month, day, tzinfo=timezone.utc)
            date_end = date_start + timedelta(days=1)
            query = query.where(TelemetryRecord.recorded_at >= date_start)
            query = query.where(TelemetryRecord.recorded_at < date_end)
        except ValueError:
            pass
    
    # Filtro por hora (solo si hay fecha)
    if hour is not None and date:
        try:
            year, month, day = map(int, date.split('-'))
            hour_start = datetime(year, month, day, hour, 0, 0, tzinfo=timezone.utc)
            hour_end = hour_start + timedelta(hours=1)
            query = query.where(TelemetryRecord.recorded_at >= hour_start)
            query = query.where(TelemetryRecord.recorded_at < hour_end)
        except ValueError:
            pass

    result = await db.execute(
        query.order_by(desc(TelemetryRecord.recorded_at)).offset(offset).limit(limit)
    )
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
    """
    Dispara manualmente la recolección de telemetría.
    
    Require:
        Rol 'admin' en el token JWT
    
    Este endpoint fuerza una recolección inmediata de telemetría
    desde Home Assistant, útil para pruebas o cuando se necesita
    datos frescos fuera del intervalo programado.
    
    Returns:
        Mensaje con la cantidad de registros guardados
    """
    saved = await telemetry_service.collect_all()
    return {"message": f"Recolección completada: {saved} registros guardados"}
