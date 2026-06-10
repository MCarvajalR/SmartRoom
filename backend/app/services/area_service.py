"""Utilidades para administrar el catalogo local de areas."""

import re
import unicodedata
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.area import Area
from app.models.device import Device
from app.models.suppressed_ha_area import SuppressedHAArea
from app.services import ha_client


def area_id_from_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_name).strip("_")[:30] or "area"
    return f"local_{slug}_{uuid4().hex[:8]}"


async def unique_area_id(db: AsyncSession, name: str) -> str:
    base = area_id_from_name(name)
    candidate = base
    suffix = 2
    while await db.get(Area, candidate):
        candidate = f"{base[:46]}_{suffix}"
        suffix += 1
    return candidate


async def ensure_local_areas(
    db: AsyncSession,
    area_ids: set[str],
    suggested_names: dict[str, str] | None = None,
) -> set[str]:
    """Crea o actualiza areas locales usando HA como fuente de verdad."""
    if not area_ids:
        return set()

    suppressed_result = await db.execute(
        select(SuppressedHAArea.area_id).where(SuppressedHAArea.area_id.in_(area_ids))
    )
    suppressed = {row[0] for row in suppressed_result.fetchall()}
    accepted_ids = area_ids - suppressed
    if not accepted_ids:
        return set()

    result = await db.execute(select(Area).where(Area.area_id.in_(accepted_ids)))
    existing_areas = {area.area_id: area for area in result.scalars().all()}
    names = suggested_names or {}

    for area_id, area in existing_areas.items():
        if names.get(area_id) and area.name != names[area_id]:
            area.name = names[area_id]

    for area_id in accepted_ids - set(existing_areas):
        fallback = area_id.replace("_", " ").replace("-", " ").strip().title()
        name = names.get(area_id) or fallback or "Area"
        duplicate = await db.execute(select(Area).where(Area.name == name))
        if duplicate.scalar_one_or_none():
            name = f"{name} ({area_id})"[:80]
        db.add(Area(area_id=area_id, name=name))

    return accepted_ids


async def sync_areas_from_ha(db: AsyncSession) -> list[Area]:
    """Sincroniza el catalogo local con las areas actuales de Home Assistant."""
    if not await ha_client.ha_is_available():
        result = await db.execute(select(Area).order_by(Area.name))
        return list(result.scalars().all())

    raw_ha_areas = await ha_client.get_areas()
    if not raw_ha_areas:
        result = await db.execute(select(Area).order_by(Area.name))
        return list(result.scalars().all())

    ha_areas = [
        area
        for area in raw_ha_areas
        if area.get("area_id") and area.get("name")
    ]
    ha_area_ids = {area["area_id"] for area in ha_areas}
    names = {area["area_id"]: area["name"] for area in ha_areas}

    await db.execute(delete(SuppressedHAArea).where(SuppressedHAArea.area_id.in_(ha_area_ids)))
    await ensure_local_areas(db, ha_area_ids, names)

    local_result = await db.execute(select(Area))
    local_areas = list(local_result.scalars().all())
    stale_area_ids = {
        area.area_id
        for area in local_areas
        if not area.area_id.startswith("local_")
    } - ha_area_ids

    if stale_area_ids:
        devices_result = await db.execute(select(Device).where(Device.area_id.in_(stale_area_ids)))
        for device in devices_result.scalars().all():
            device.area_id = None
        await db.execute(delete(SuppressedHAArea).where(SuppressedHAArea.area_id.in_(stale_area_ids)))
        await db.execute(delete(Area).where(Area.area_id.in_(stale_area_ids)))

    result = await db.execute(select(Area).order_by(Area.name))
    return list(result.scalars().all())
