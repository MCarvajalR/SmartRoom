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
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_optional_user, get_visible_levels, require_roles
from app.models.area import Area
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
from app.services.area_service import sync_areas_from_ha, unique_area_id

router = APIRouter(prefix="/devices", tags=["Dispositivos"])


class AreaPayload(BaseModel):
    name: str = Field(min_length=2, max_length=80)


async def use_ha_area_registry() -> bool:
    """Usa HA como fuente de verdad solo cuando esta disponible."""
    return await ha_client.ha_is_available()


async def create_local_area(db: AsyncSession, name: str) -> Area:
    area = Area(area_id=await unique_area_id(db, name), name=name)
    db.add(area)
    return area


@router.get("/areas", response_model=list[dict])
async def list_areas(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    areas = await sync_areas_from_ha(db)
    await db.commit()
    return [{"area_id": area.area_id, "name": area.name} for area in areas]


@router.post("/areas", response_model=dict)
async def create_area(
    payload: AreaPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="El nombre del area es obligatorio.")
    try:
        if not await use_ha_area_registry():
            area = await create_local_area(db, name)
        else:
            created = await ha_client.create_area(name)
            area_id = created.get("area_id")
            if not area_id:
                areas = await sync_areas_from_ha(db)
                area = next((item for item in areas if item.name == name), None)
                if not area:
                    raise RuntimeError("Home Assistant no devolvio el ID del area creada.")
            else:
                area = Area(area_id=area_id, name=created.get("name") or name)
                existing = await db.get(Area, area.area_id)
                if existing:
                    existing.name = area.name
                    area = existing
                else:
                    db.add(area)
        await db.commit()
        return {"area_id": area.area_id, "name": area.name}
    except Exception as exc:
        await db.rollback()
        if isinstance(exc, IntegrityError):
            raise HTTPException(status_code=409, detail="Ya existe un area con ese nombre.")
        raise HTTPException(status_code=502, detail=str(exc))


@router.patch("/areas/{area_id}", response_model=dict)
async def rename_area(
    area_id: str,
    payload: AreaPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area no encontrada.")
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="El nombre del area es obligatorio.")
    try:
        if not area_id.startswith("local_") and await use_ha_area_registry():
            await ha_client.update_area(area_id, name)
        area.name = name
        await db.commit()
        return {"area_id": area.area_id, "name": area.name}
    except Exception as exc:
        await db.rollback()
        if isinstance(exc, IntegrityError):
            raise HTTPException(status_code=409, detail="Ya existe un area con ese nombre.")
        raise HTTPException(status_code=502, detail=str(exc))


@router.delete("/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(
    area_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area no encontrada.")
    try:
        if not area_id.startswith("local_") and await use_ha_area_registry():
            await ha_client.delete_area(area_id)
        result = await db.execute(select(Device).where(Device.area_id == area_id))
        for device in result.scalars().all():
            device.area_id = None
        await db.delete(area)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=502, detail=str(exc))
    return None


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
        .where(~Device.entity_id.contains(ha_client.VIRTUAL_ATTRIBUTE_SEPARATOR))
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
    if ha_client.is_system_managed_entity(device.entity_id):
        raise HTTPException(
            status_code=409,
            detail="Este registro es administrado por SmartRoom y alimenta una tarjeta compuesta.",
        )

    changes = payload.model_dump(exclude_unset=True)
    if changes.get("area_id") and not await db.get(Area, changes["area_id"]):
        raise HTTPException(status_code=400, detail="El area seleccionada no existe.")

    target_area_id = changes.get("area_id")
    should_sync_area_to_ha = (
        "area_id" in changes
        and target_area_id != device.area_id
        and (target_area_id is None or not target_area_id.startswith("local_"))
        and await use_ha_area_registry()
    )
    if should_sync_area_to_ha:
        try:
            await ha_client.assign_entity_area(device.entity_id, target_area_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    for field, value in changes.items():
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
    if ha_client.is_system_managed_entity(device.entity_id):
        raise HTTPException(
            status_code=409,
            detail="Este registro es administrado por SmartRoom y no puede eliminarse manualmente.",
        )

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
    await sync_areas_from_ha(db)
    await db.commit()

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
    
    Usa el catálogo local de áreas para mostrar nombres descriptivos.
    
    Returns:
        Lista de áreas con sus dispositivos
    """
    local_areas = await sync_areas_from_ha(db)
    await db.commit()

    levels = get_visible_levels(current_user)

    result = await db.execute(
        select(Device)
        .where(Device.area_id.is_not(None))
        .where(Device.visibility.in_(levels))
        .where(Device.is_active.is_(True))
        .order_by(Device.area_id, Device.name)
    )
    devices = result.scalars().all()

    area_name_map = {area.area_id: area.name for area in local_areas}

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
    known_area_ids: set[str] = set()
    for area_id, area_devices in grouped.items():
        known_area_ids.add(area_id)
        area_devices.sort(key=lambda d: d.name.lower())
        response.append(
            DevicesByAreaHybridOut(
                area_id=area_id,
                area_name=area_name_map.get(area_id, area_id),
                devices=area_devices,
            )
        )

    for area in local_areas:
        if area.area_id not in known_area_ids:
            response.append(
                DevicesByAreaHybridOut(
                    area_id=area.area_id,
                    area_name=area.name,
                    devices=[],
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
        area_id: ID del área local en SmartRoom
    
    Returns:
        Lista de dispositivos en esa área
    """
    await sync_areas_from_ha(db)
    await db.commit()

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
