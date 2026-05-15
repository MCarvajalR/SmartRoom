"""
Endpoints de descubrimiento de dispositivos en Home Assistant.

Permite:
- Listar entidades disponibles en HA
- Importar entidades seleccionadas al sistema
"""

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_session
from app.models.device import Device

router = APIRouter()


class DiscoveredEntity(BaseModel):
    """Entidad descubierta en Home Assistant."""
    entity_id: str
    friendly_name: str
    state: str
    unit: str | None
    device_class: str | None
    already_registered: bool


class ImportRequest(BaseModel):
    """Solicitud de importación de entidades."""
    entities: List[dict]


RELEVANT_PREFIXES = (
    "sensor.", "input_number.", "switch.",
    "binary_sensor.", "lock.", "light.", "climate.", "cover.",
)

DEVICE_CLASS_MAP = {
    "temperature": "temperature",
    "humidity": "humidity",
    "power": "plug",
    "energy": "plug",
    "lock": "lock",
    "illuminance": "light",
}


@router.get("/discover", response_model=List[DiscoveredEntity])
async def discover_ha_entities(db: AsyncSession = Depends(get_async_session)):
    """
    Lista todas las entidades relevantes de Home Assistant.
    
    Indica cuáles ya están registradas en el sistema.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{settings.HA_URL}/api/states",
                headers={"Authorization": f"Bearer {settings.HA_TOKEN}"},
            )
        res.raise_for_status()
        all_states = res.json()
    except Exception as e:
        raise HTTPException(502, f"No se pudo conectar a Home Assistant: {e}")

    result = await db.execute(select(Device.entity_id))
    registered = {row[0] for row in result.fetchall()}

    discovered = []
    for s in all_states:
        eid = s["entity_id"]
        if not any(eid.startswith(p) for p in RELEVANT_PREFIXES):
            continue
        attrs = s.get("attributes", {})
        discovered.append(DiscoveredEntity(
            entity_id=eid,
            friendly_name=attrs.get("friendly_name", eid),
            state=s["state"],
            unit=attrs.get("unit_of_measurement"),
            device_class=attrs.get("device_class"),
            already_registered=eid in registered,
        ))

    return sorted(discovered, key=lambda x: (x.already_registered, x.entity_id))


@router.post("/discover/import")
async def import_entities(
    body: ImportRequest,
    db: AsyncSession = Depends(get_async_session),
):
    """Importa entidades seleccionadas desde Home Assistant al sistema."""
    result = await db.execute(select(Device.entity_id))
    registered = {row[0] for row in result.fetchall()}

    created, skipped = [], []

    for e in body.entities:
        eid = e.get("entity_id")
        if not eid or eid in registered:
            skipped.append(eid)
            continue

        device = Device(
            entity_id=eid,
            name=e.get("name", eid),
            device_type=e.get("device_type", "other"),
            unit=e.get("unit"),
            visibility=e.get("visibility", "public"),
            is_active=True,
        )
        db.add(device)
        created.append(eid)

    await db.commit()
    return {"created": created, "skipped": skipped}