"""
Endpoints de descubrimiento de dispositivos en Home Assistant.

Permite:
- Listar entidades relevantes disponibles en HA (filtradas por prefijos)
- Importar entidades seleccionadas al sistema de monitoreo
- Listar áreas definidas en Home Assistant
- Sincronizar todos los dispositivos desde HA

Estos endpoints son útiles para:
- Descubrir qué dispositivos existen en Home Assistant
- Importar selectivamente dispositivos al sistema
- Mantener sincronizada la base de datos local
"""

from typing import List
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.models.device import Device
from app.services import ha_client
from app.services.device_sync import sync_devices_from_ha

router = APIRouter()
logger = logging.getLogger(__name__)


class DiscoveredEntity(BaseModel):
    """
    Entidad descubierta en Home Assistant.
    
    Attributes:
        entity_id: ID de la entidad en HA
        friendly_name: Nombre descriptivo
        state: Estado actual (on, off, unavailable, etc.)
        unit: Unidad de medición
        device_class: Clase del dispositivo
        area_id: Área a la que pertenece
        already_registered: Si ya está importada al sistema
    """
    entity_id: str
    friendly_name: str
    state: str
    unit: str | None = None
    device_class: str | None = None
    area_id: str | None = None
    already_registered: bool


class ImportEntity(BaseModel):
    """
    Entidad a importar desde Home Assistant.
    
    Attributes:
        entity_id: ID de la entidad en HA (obligatorio)
        name: Nombre personalizado para el dispositivo
        device_type: Tipo de dispositivo
        unit: Unidad de medición
        area_id: Área a asignar
        visibility: Nivel de visibilidad
    """
    entity_id: str
    name: str
    device_type: str = "other"
    unit: str | None = None
    area_id: str | None = None
    visibility: str = "public"


class ImportRequest(BaseModel):
    """
    Solicitud de importación de entidades.
    
    Attributes:
        entities: Lista de entidades a importar
    """
    entities: List[ImportEntity]


@router.get("/discover", response_model=List[DiscoveredEntity])
async def discover_ha_entities(db: AsyncSession = Depends(get_db)):
    """
    Lista todas las entidades relevantes de Home Assistant.
    
    Filtra entidades por prefijos relevantes (sensor, switch, lock, etc.)
    y marca cuáles ya están registradas en el sistema.
    
    Returns:
        Lista de DiscoveredEntity ordenada: primero no registrados, luego registrados
    
    Raises:
        502: Si no se puede conectar a Home Assistant
    """
    try:
        all_states = await ha_client.get_all_states()
    except Exception as e:
        logger.exception("Error consultando Home Assistant")
        raise HTTPException(status_code=502, detail=f"No se pudo conectar a Home Assistant: {e}")

    # Obtener mapeo de entidades a áreas
    entity_area_map = await ha_client.get_entities_with_areas()

    # Obtener IDs de dispositivos ya registrados
    result = await db.execute(select(Device.entity_id))
    registered = {row[0] for row in result.fetchall()}

    discovered = []
    for s in all_states:
        eid = s.get("entity_id")
        # Filtrar por prefijos relevantes
        if not eid or not any(eid.startswith(p) for p in ha_client.RELEVANT_PREFIXES):
            continue

        attrs = s.get("attributes", {})
        discovered.append(
            DiscoveredEntity(
                entity_id=eid,
                friendly_name=attrs.get("friendly_name", eid),
                state=s.get("state", "unknown"),
                unit=attrs.get("unit_of_measurement"),
                device_class=attrs.get("device_class"),
                area_id=entity_area_map.get(eid),
                already_registered=eid in registered,
            )
        )

    # Ordenar: primero no registrados, luego registrados, por entity_id
    return sorted(discovered, key=lambda x: (x.already_registered, x.entity_id))


@router.post("/discover/import")
async def import_discovered_devices(
    body: ImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Importa entidades seleccionadas al sistema.
    
    Args:
        body: ImportRequest con lista de entidades a importar
    
    Returns:
        Dict con resumen de la operación:
        - created_count: Cantidad de entidades creadas
        - skipped_count: Entidades ya existentes
        - error_count: Errores durante la importación
        - created: Lista de entity_ids creados
        - skipped: Lista de entity_ids omitidos con razón
        - errors: Errores detallados por índice
    
    Raises:
        400: Si no se reciben entidades
        500: Error de base de datos u otro error inesperado
    """
    try:
        if not body.entities:
            raise HTTPException(status_code=400, detail="No se recibieron entidades para importar")

        # Obtener entity_ids existentes
        result = await db.execute(select(Device.entity_id))
        existing_entity_ids = {row[0] for row in result.fetchall()}

        created = []
        skipped = []
        errors = []

        for idx, e in enumerate(body.entities):
            try:
                if not e.entity_id:
                    errors.append({
                        "index": idx,
                        "error": "entity_id es obligatorio"
                    })
                    continue

                if e.entity_id in existing_entity_ids:
                    skipped.append({
                        "entity_id": e.entity_id,
                        "reason": "already_exists"
                    })
                    continue

                device = Device(
                    entity_id=e.entity_id,
                    name=e.name or e.entity_id,
                    device_type=e.device_type or "other",
                    unit=e.unit,
                    area_id=e.area_id,
                    visibility=e.visibility or "public",
                    is_active=True,
                )

                db.add(device)
                existing_entity_ids.add(e.entity_id)

                created.append({
                    "entity_id": e.entity_id
                })

            except Exception as exc:
                errors.append({
                    "index": idx,
                    "entity_id": e.entity_id,
                    "error": str(exc)
                })

        # Commit solo si hay creaciones
        if created:
            await db.commit()
        else:
            await db.rollback()

        return {
            "message": "Importación completada",
            "created_count": len(created),
            "skipped_count": len(skipped),
            "error_count": len(errors),
            "created": created,
            "skipped": skipped,
            "errors": errors,
        }

    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.exception("Error de base de datos en import_discovered_devices")
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")
    except Exception as exc:
        await db.rollback()
        logger.exception("Error inesperado en import_discovered_devices")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(exc)}")


@router.get("/ha-areas")
async def list_ha_areas():
    """
    Lista todas las áreas definidas en Home Assistant.
    
    Returns:
        Lista de dicts con area_id y name de cada área
    """
    return await ha_client.get_areas()


@router.post("/discover/sync")
async def sync_discovered_devices(
    db: AsyncSession = Depends(get_db),
):
    """
    Sincroniza todos los dispositivos desde Home Assistant.
    
    Crea dispositivos nuevos, actualiza existentes y reactiva
    los que habían sido desactivados.
    
    Returns:
        Dict con mensaje y resultado del sync (created, updated, etc.)
    
    Raises:
        500: Si ocurre un error durante la sincronización
    """
    try:
        result = await sync_devices_from_ha(db)
        return {
            "message": "Sincronización completada",
            **result
        }
    except Exception as exc:
        logger.exception("Error sincronizando dispositivos desde HA")
        raise HTTPException(status_code=500, detail=str(exc))