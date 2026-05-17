"""
Endpoints de gestión de dispositivos.

Proporciona operaciones CRUD sobre dispositivos registrados:
- Listado de dispositivos (filtrados por visibilidad según rol)
- Actualización de atributos (solo admin)
- Eliminación de dispositivos (solo admin, también elimina en HA)
- Listado por áreas

Filtros de visibilidad:
- Anónimo: solo dispositivos con visibility='public'
- Docente: visibility='public' y 'docente'
- Admin: todos los niveles
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_optional_user, get_visible_levels, require_roles
from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.models.user import User
from app.schemas.device import (
    DeviceResponse,
    DeviceUpdate,
    AreaDeviceHybridOut,
    DevicesByAreaHybridOut,
)
from app.services import ha_client

router = APIRouter(prefix="/devices", tags=["Dispositivos"])


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Lista dispositivos visibles según el rol del usuario.
    
    Returns:
        Lista de dispositivos filtrados por visibility y activos
    """
    levels = get_visible_levels(current_user)
    result = await db.execute(
        select(Device)
        .where(Device.visibility.in_(levels))
        .where(Device.is_active.is_(True))
        .order_by(Device.name)
    )
    return result.scalars().all()


@router.get("/all", response_model=list[DeviceResponse])
async def list_all_devices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """
    Lista todos los dispositivos sin filtros (solo admin).
    
    Require:
        Rol 'admin' en el token JWT
    
    Returns:
        Lista completa de dispositivos
    """
    result = await db.execute(
        select(Device)
        .order_by(Device.name)
    )
    return result.scalars().all()


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: int,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """
    Actualiza un dispositivo existente.
    
    Require:
        Rol 'admin' en el token JWT
    
    Args:
        device_id: ID del dispositivo a actualizar
        payload: DeviceUpdate con campos a modificar
    
    Returns:
        DeviceResponse con los datos actualizados
    
    Raises:
        404: Si el dispositivo no existe
    """
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
    """
    Elimina un dispositivo de la BD y de Home Assistant.
    
    Require:
        Rol 'admin' en el token JWT
    
    Args:
        device_id: ID del dispositivo a eliminar
    
    Raises:
        404: Si el dispositivo no existe
    """
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    entity_id = device.entity_id

    # Eliminar registros de telemetría asociados
    await db.execute(delete(TelemetryRecord).where(TelemetryRecord.device_id == device_id))

    await db.delete(device)
    await db.commit()

    # Intentar eliminar también en Home Assistant
    try:
        await ha_client.delete_entity(entity_id)
    except Exception:
        pass

    return None


@router.get("/areas/used", response_model=list[dict])
async def list_used_areas(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Lista áreas que tienen dispositivos visibles.
    
    Returns:
        Lista de area_id únicos con dispositivos
    """
    levels = get_visible_levels(current_user)

    result = await db.execute(
        select(Device.area_id)
        .where(Device.area_id.is_not(None))
        .where(Device.visibility.in_(levels))
        .where(Device.is_active.is_(True))
        .distinct()
    )
    area_ids = [row[0] for row in result.fetchall() if row[0]]

    return [{"area_id": aid} for aid in sorted(area_ids)]


@router.get("/grouped-by-area", response_model=List[DevicesByAreaHybridOut])
async def get_devices_grouped_by_area(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Lista dispositivos agrupados por área.
    
    Obtiene los nombres de áreas desde Home Assistant para mostrar
    nombres descriptivos en lugar de IDs.
    
    Returns:
        Lista de áreas con sus dispositivos
    """
    levels = get_visible_levels(current_user)

    result = await db.execute(
        select(Device)
        .where(Device.area_id.is_not(None))
        .where(Device.visibility.in_(levels))
        .where(Device.is_active.is_(True))
        .order_by(Device.area_id, Device.name)
    )
    devices = result.scalars().all()

    if not devices:
        return []

    # Obtener nombres de áreas desde HA
    ha_areas = await ha_client.get_areas()
    area_name_map = {
        area["area_id"]: area["name"]
        for area in ha_areas
        if area.get("area_id") and area.get("name")
    }

    grouped: dict[str, list[AreaDeviceHybridOut]] = {}

    for device in devices:
        grouped.setdefault(device.area_id, []).append(
            AreaDeviceHybridOut(
                id=device.id,
                entity_id=device.entity_id,
                name=device.name,
                device_type=device.device_type,
                unit=device.unit,
                area_id=device.area_id,
                is_active=device.is_active,
                visibility=device.visibility,
                created_at=device.created_at,
                source="db",
            )
        )

    response: list[DevicesByAreaHybridOut] = []
    for area_id, area_devices in grouped.items():
        area_devices.sort(key=lambda d: d.name.lower())
        response.append(
            DevicesByAreaHybridOut(
                area_id=area_id,
                area_name=area_name_map.get(area_id, area_id),
                devices=area_devices,
            )
        )

    response.sort(key=lambda x: x.area_name.lower())
    return response


@router.get("/by-area/{area_id}", response_model=list[AreaDeviceHybridOut])
async def list_devices_by_area(
    area_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Lista dispositivos de un área específica.
    
    Args:
        area_id: ID del área en Home Assistant
    
    Returns:
        Lista de dispositivos en esa área
    """
    levels = get_visible_levels(current_user)

    result = await db.execute(
        select(Device)
        .where(Device.area_id == area_id)
        .where(Device.visibility.in_(levels))
        .where(Device.is_active.is_(True))
        .order_by(Device.name)
    )
    devices = result.scalars().all()

    return [
        AreaDeviceHybridOut(
            id=device.id,
            entity_id=device.entity_id,
            name=device.name,
            device_type=device.device_type,
            unit=device.unit,
            area_id=device.area_id,
            is_active=device.is_active,
            visibility=device.visibility,
            created_at=device.created_at,
            source="db",
        )
        for device in devices
    ]