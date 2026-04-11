from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_roles
from app.models.access_log import AccessLog
from app.models.user import User
from app.schemas.access import AccessLogResponse, DoorStateResponse
from app.services.ha_client import call_service, get_state

router = APIRouter(prefix="/access", tags=["Control de Acceso"])

# entity_id del lock/puerta en Home Assistant
DOOR_ENTITY_ID = "input_boolean.puerta_laboratorio_simulada"


@router.get("/door", response_model=DoorStateResponse)
async def get_door_state(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Estado actual de la cerradura."""
    state_data = await get_state(DOOR_ENTITY_ID)
    if not state_data:
        raise HTTPException(status_code=502, detail="No se pudo conectar con Home Assistant")

    log = AccessLog(
        entity_id=DOOR_ENTITY_ID,
        action="query",
        triggered_by=current_user.username,
    )
    db.add(log)
    await db.commit()

    attrs = state_data.get("attributes", {})
    return DoorStateResponse(
        entity_id=DOOR_ENTITY_ID,
        state=state_data.get("state", "unknown"),
        friendly_name=attrs.get("friendly_name"),
    )


@router.post("/door/lock", status_code=200)
async def lock_door(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Bloquear la puerta (solo admin)."""
    success = await call_service("input_boolean", "turn_off", DOOR_ENTITY_ID)
    if not success:
        raise HTTPException(status_code=502, detail="Error al ejecutar el servicio en Home Assistant")

    log = AccessLog(entity_id=DOOR_ENTITY_ID, action="lock", triggered_by=current_user.username)
    db.add(log)
    await db.commit()
    return {"message": "Puerta bloqueada", "triggered_by": current_user.username}


@router.post("/door/unlock", status_code=200)
async def unlock_door(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "docente")),
):
    """Desbloquear la puerta (admin y docente)."""
    success = await call_service("input_boolean", "turn_on", DOOR_ENTITY_ID)
    if not success:
        raise HTTPException(status_code=502, detail="Error al ejecutar el servicio en Home Assistant")

    log = AccessLog(entity_id=DOOR_ENTITY_ID, action="unlock", triggered_by=current_user.username)
    db.add(log)
    await db.commit()
    return {"message": "Puerta desbloqueada", "triggered_by": current_user.username}


@router.get("/logs", response_model=list[AccessLogResponse])
async def get_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "docente")),
):
    """Historial de eventos de acceso."""
    result = await db.execute(
        select(AccessLog).order_by(desc(AccessLog.triggered_at)).limit(limit)
    )
    return result.scalars().all()
