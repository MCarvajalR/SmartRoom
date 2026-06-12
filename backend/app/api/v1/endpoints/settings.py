"""
Endpoints de configuración del sistema.

Proporciona endpoints para:
- Obtener la configuración global del sistema
- Actualizar la configuración (intervalo de telemetría, entity de puerta)
- Obtener historial de telemetría de un dispositivo específico

La configuración incluye:
- telemetry_interval_seconds: Frecuencia de recolección de telemetría
- door_entity_id: Entity ID de la cerradura en Home Assistant
"""

from typing import List
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_optional_user, require_roles
from app.models.device import Device
from app.models.settings import Settings
from app.models.telemetry import TelemetryRecord
from app.models.user import User
from app.services.telemetry_retention import delete_expired_records
from app.services.scheduler import scheduler

from app.core.config import settings as app_settings

router = APIRouter(prefix="/settings", tags=["Configuración"])


class SettingsResponse(BaseModel):
    """
    Respuesta con la configuración actual del sistema.
    
    Attributes:
        telemetry_interval_seconds: Intervalo de recolección en segundos
        door_entity_id: Entity ID de la puerta en Home Assistant
    """
    telemetry_interval_seconds: int
    telemetry_retention_days: int
    telemetry_retention_enabled: bool
    door_entity_id: str | None = None

    ha_public_url: str | None = None
    deleted_records: int = 0

    model_config = {"from_attributes": True}


class SettingsUpdate(BaseModel):
    """
    Esquema para actualizar la configuración.
    
    Todos los campos son opcionales para permitir actualizaciones parciales.
    
    Attributes:
        telemetry_interval_seconds: Nuevo intervalo de telemetría
        door_entity_id: Nueva entity ID de la puerta
    """
    telemetry_interval_seconds: int | None = Field(default=None, ge=10, le=3600)
    telemetry_retention_days: int | None = Field(default=None, ge=1, le=3650)
    confirm_retention_cleanup: bool = False
    door_entity_id: str | None = None


class RetentionPreviewResponse(BaseModel):
    retention_days: int
    cutoff: datetime
    records_to_delete: int


class TelemetryHistoryResponse(BaseModel):
    """
    Respuesta de historial de telemetría.
    
    Attributes:
        device_id: ID del dispositivo
        device_name: Nombre del dispositivo
        value: Valor numérico
        raw_state: Estado textual
        recorded_at: Timestamp del registro (formato ISO)
    """
    device_id: int
    device_name: str
    value: float | None
    raw_state: str
    recorded_at: str


@router.get("", response_model=SettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene la configuración global del sistema.
    
    Si no existe configuración, crea una por defecto:
    - telemetry_interval_seconds: 60
    - door_entity_id: input_boolean.puerta_laboratorio_simulada
    
    Returns:
        SettingsResponse con la configuración actual
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        result = await db.execute(select(Settings).where(Settings.id == 1))
        settings = result.scalar_one_or_none()
        
        logger.info(f"Settings query result: {settings}")
    
        # Si existe, retornarla con la URL pública de HA
        if settings:
            logger.info(f"Returning existing settings: {settings.telemetry_interval_seconds}, {settings.door_entity_id}")
            result = {
                "telemetry_interval_seconds": settings.telemetry_interval_seconds,
                "telemetry_retention_days": settings.telemetry_retention_days,
                "telemetry_retention_enabled": settings.telemetry_retention_enabled,
                "door_entity_id": settings.door_entity_id,
                "ha_public_url": app_settings.HA_PUBLIC_URL,
            }
            return result
        
        # Crear configuración por defecto si no existe
        settings = Settings(
            id=1,
            telemetry_interval_seconds=60,
            telemetry_retention_days=30,
            telemetry_retention_enabled=False,
            door_entity_id="input_boolean.puerta_laboratorio_simulada",
            updated_at=datetime.now(timezone.utc)
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
        
        return {
            "telemetry_interval_seconds": settings.telemetry_interval_seconds,
            "telemetry_retention_days": settings.telemetry_retention_days,
            "telemetry_retention_enabled": settings.telemetry_retention_enabled,
            "door_entity_id": settings.door_entity_id,
            "ha_public_url": app_settings.HA_PUBLIC_URL,
        }
    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener configuración: {str(e)}")


@router.get("/retention/preview", response_model=RetentionPreviewResponse)
async def preview_retention_cleanup(
    days: int = Query(..., ge=1, le=3650),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(func.count(TelemetryRecord.id)).where(TelemetryRecord.recorded_at < cutoff)
    )
    return {
        "retention_days": days,
        "cutoff": cutoff,
        "records_to_delete": result.scalar_one(),
    }


@router.patch("", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """
    Actualiza la configuración global del sistema.
    
    Args:
        payload: SettingsUpdate con campos a modificar
    
    Returns:
        SettingsResponse con la configuración actualizada
    
    Side Effects:
        Si se modifica el intervalo, también actualiza el scheduler
    """
    result = await db.execute(select(Settings).where(Settings.id == 1))
    settings = result.scalar_one_or_none()
    current_retention_days = settings.telemetry_retention_days if settings else 30
    retention_enabled = settings.telemetry_retention_enabled if settings else False
    retention_changed = (
        payload.telemetry_retention_days is not None
        and (
            payload.telemetry_retention_days != current_retention_days
            or not retention_enabled
        )
    )

    if retention_changed and not payload.confirm_retention_cleanup:
        raise HTTPException(
            status_code=409,
            detail=(
                "Debes confirmar la limpieza del historial. "
                "Los registros anteriores al nuevo periodo se eliminaran permanentemente."
            ),
        )
    
    # Crear o actualizar configuración
    if not settings:
        settings = Settings(
            id=1,
            telemetry_interval_seconds=payload.telemetry_interval_seconds or 60,
            telemetry_retention_days=payload.telemetry_retention_days or 30,
            telemetry_retention_enabled=retention_changed,
            door_entity_id=payload.door_entity_id or "input_boolean.puerta_laboratorio_simulada",
            updated_at=datetime.now(timezone.utc)
        )
        db.add(settings)
    else:
        if payload.telemetry_interval_seconds is not None:
            settings.telemetry_interval_seconds = payload.telemetry_interval_seconds
        if payload.telemetry_retention_days is not None:
            settings.telemetry_retention_days = payload.telemetry_retention_days
            settings.telemetry_retention_enabled = True
        if payload.door_entity_id is not None:
            settings.door_entity_id = payload.door_entity_id
        settings.updated_at = datetime.now(timezone.utc)
    
    deleted_records = 0
    if retention_changed:
        try:
            deleted_records = await delete_expired_records(
                db,
                payload.telemetry_retention_days,
            )
        except Exception as exc:
            await db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"No se pudo completar la limpieza; no se guardo el cambio: {exc}",
            ) from exc

    await db.commit()
    await db.refresh(settings)

    # Actualizar scheduler si cambió el intervalo
    if payload.telemetry_interval_seconds is not None:
        try:
            if scheduler.running:
                for job_id in ("collect_telemetry", "sync_devices_from_ha"):
                    scheduler.reschedule_job(
                        job_id,
                        trigger="interval",
                        seconds=payload.telemetry_interval_seconds,
                    )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"No se pudo actualizar el scheduler: {e}")

    return {
        "telemetry_interval_seconds": settings.telemetry_interval_seconds,
        "telemetry_retention_days": settings.telemetry_retention_days,
        "telemetry_retention_enabled": settings.telemetry_retention_enabled,
        "door_entity_id": settings.door_entity_id,
        "ha_public_url": app_settings.HA_PUBLIC_URL,
        "deleted_records": deleted_records,
    }


@router.get("/telemetry/history/{device_id}", response_model=List[TelemetryHistoryResponse])
async def get_telemetry_history(
    device_id: int,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "docente")),
):
    """
    Obtiene el historial de telemetría de un dispositivo específico.
    
    Require:
        Rol 'admin' o 'docente' en el token JWT
    
    Args:
        device_id: ID del dispositivo
        limit: Cantidad máxima de registros (default: 100)
    
    Returns:
        Lista de TelemetryHistoryResponse ordenados por fecha descendente
    
    Raises:
        404: Si el dispositivo no existe
    """
    # Verificar que el dispositivo existe
    device_result = await db.execute(select(Device).where(Device.id == device_id))
    device = device_result.scalar_one_or_none()
    
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    # Obtener registros de telemetría
    result = await db.execute(
        select(TelemetryRecord)
        .where(TelemetryRecord.device_id == device_id)
        .order_by(TelemetryRecord.recorded_at.desc())
        .limit(limit)
    )
    records = result.scalars().all()

    return [
        TelemetryHistoryResponse(
            device_id=r.device_id,
            device_name=device.name,
            value=r.value,
            raw_state=r.raw_state,
            recorded_at=r.recorded_at.isoformat(),
        )
        for r in records
    ]
