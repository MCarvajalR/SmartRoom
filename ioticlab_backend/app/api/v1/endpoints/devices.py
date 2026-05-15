"""
Endpoints de gestión de dispositivos.

Proporciona CRUD completo de dispositivos registrados:
- Listado de dispositivos
- Creación de dispositivos (solo admin)
- Actualización de dispositivos (solo admin)
- Eliminación de dispositivos (solo admin)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, get_optional_user, get_visible_levels, require_roles
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceResponse, DeviceUpdate

router = APIRouter(prefix="/devices", tags=["Dispositivos"])


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Lista todos los dispositivos visibles según el rol del usuario."""
    levels = get_visible_levels(current_user)
    result = await db.execute(select(Device).where(Device.visibility.in_(levels)))
    return result.scalars().all()


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """Crea un nuevo dispositivo. Solo accesible por administradores."""
    existing = await db.execute(select(Device).where(Device.entity_id == payload.entity_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe un dispositivo con ese entity_id")

    device = Device(**payload.model_dump())
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: int,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """Actualiza un dispositivo existente. Solo accesible por administradores."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, field, value)

    await db.commit()
    await db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """Elimina un dispositivo. Solo accesible por administradores."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    await db.delete(device)
    await db.commit()