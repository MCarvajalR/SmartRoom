"""
Endpoints de control de acceso a la puerta del laboratorio.

Proporciona funcionalidad para:
- Consultar el estado actual de la puerta
- Bloquear la puerta (solo admin)
- Desbloquear la puerta (admin y docente)
- Ver historial de eventos de acceso (admin y docente)

La puerta se controla desde una entidad real de Home Assistant.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_roles
from app.models.access_log import AccessLog
from app.models.user import User
from app.schemas.access import AccessLogResponse, DoorStateResponse
from app.services.ha_client import call_service, get_state

router = APIRouter(prefix="/access", tags=["Control de Acceso"])

# Entity ID de la cerradura real en HA
DOOR_LOCK_ENTITY_ID = "lock.puerta_laboratorio"


async def get_door_entity_id() -> str:
    """
    Retorna el entity_id de la puerta real.
    """
    return DOOR_LOCK_ENTITY_ID


async def call_door_service(action: str) -> bool:
    """
    Llama al servicio correcto para bloquear/desbloquear la puerta.
    
    Args:
        action: "lock" para bloquear, "unlock" para desbloquear
    
    Returns:
        True si el servicio se ejecutó exitosamente
    """
    door_id = await get_door_entity_id()

    # Determinar servicio según tipo de entidad
    if door_id.startswith("lock."):
        service = "lock" if action == "lock" else "unlock"
        return await call_service("lock", service, door_id)
    else:
        service = "turn_off" if action == "lock" else "turn_on"
        return await call_service("input_boolean", service, door_id)


@router.get("/door", response_model=DoorStateResponse)
async def get_door_state(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna el estado actual de la puerta del laboratorio.
    
    Require:
        Token JWT válido
    
    Returns:
        DoorStateResponse con entity_id, state y friendly_name
    
    Raises:
        502: Si no se puede conectar a Home Assistant
    
    """
    door_id = await get_door_entity_id()
    state_data = await get_state(door_id)
    if not state_data:
        raise HTTPException(status_code=502, detail="No se pudo conectar con Home Assistant")

    attrs = state_data.get("attributes", {})
    ha_state = state_data.get("state", "unknown")

    # Normalizar estado según tipo de entidad
    if door_id.startswith("lock."):
        door_state = "locked" if ha_state == "locked" else "unlocked"
    else:
        door_state = "unlocked" if ha_state == "on" else "locked"

    return DoorStateResponse(
        entity_id=door_id,
        state=door_state,
        friendly_name=attrs.get("friendly_name"),
    )


@router.post("/door/lock", status_code=200)
async def lock_door(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Bloquea la puerta del laboratorio.
    
    Require:
        Rol 'admin' en el token JWT
    
    Returns:
        Mensaje de éxito con el usuario que ejecutó la acción
    
    Raises:
        502: Si Home Assistant no responde
    
    Side Effects:
        Registra el evento en access_logs
    """
    door_id = await get_door_entity_id()
    success = await call_door_service("lock")
    if not success:
        raise HTTPException(status_code=502, detail="Error al ejecutar el servicio en Home Assistant")

    log = AccessLog(entity_id=door_id, action="lock", triggered_by=current_user.username)
    db.add(log)
    await db.commit()
    return {"message": "Puerta bloqueada", "triggered_by": current_user.username}


@router.post("/door/unlock", status_code=200)
async def unlock_door(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "docente")),
):
    """
    Desbloquea la puerta del laboratorio.
    
    Require:
        Rol 'admin' o 'docente' en el token JWT
    
    Returns:
        Mensaje de éxito con el usuario que ejecutó la acción
    
    Raises:
        502: Si Home Assistant no responde
    
    Side Effects:
        Registra el evento en access_logs
    """
    door_id = await get_door_entity_id()
    success = await call_door_service("unlock")
    if not success:
        raise HTTPException(status_code=502, detail="Error al ejecutar el servicio en Home Assistant")

    log = AccessLog(entity_id=door_id, action="unlock", triggered_by=current_user.username)
    db.add(log)
    await db.commit()
    return {"message": "Puerta desbloqueada", "triggered_by": current_user.username}


@router.get("/logs", response_model=list[AccessLogResponse])
async def get_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "docente")),
):
    """
    Retorna el historial de eventos de acceso.
    
    Require:
        Rol 'admin' o 'docente' en el token JWT
    
    Args:
        limit: Cantidad máxima de registros a retornar (default: 50)
    
    Returns:
        Lista de AccessLogResponse ordenados por fecha descendente
    """
    result = await db.execute(
        select(AccessLog)
        .where(AccessLog.action.in_(("lock", "unlock")))
        .where(AccessLog.triggered_by != "homeassistant")
        .order_by(desc(AccessLog.triggered_at))
        .limit(limit)
    )
    return result.scalars().all()
