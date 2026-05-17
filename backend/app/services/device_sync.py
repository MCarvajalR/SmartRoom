"""
Servicio de sincronización de dispositivos con Home Assistant.

Sincroniza el estado de las entidades de HA con la base de datos local:
- Crea dispositivos nuevos detectados en HA que no existen en BD
- Actualiza atributos de dispositivos existentes (nombre, tipo, unidad, área)
- Reactiva dispositivos que habían sido desactivados pero vuelven a aparecer

Este servicio se ejecuta periódicamente para mantener la BD actualizada
con los dispositivos actuales en Home Assistant.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.services import ha_client

logger = logging.getLogger(__name__)


async def sync_devices_from_ha(db: AsyncSession) -> dict:
    """
    Sincroniza dispositivos entre Home Assistant y la base de datos local.
    
    Args:
        db: Sesión de base de datos
    
    Returns:
        Dict con resumen de la sincronización:
        - created: Nuevos dispositivos añadidos
        - updated: Dispositivos con cambios
        - deactivated: Dispositivos eliminados en HA (no implementados actualmente)
        - total_in_ha: Total de dispositivos en HA
        - total_in_db_before_sync: Total en BD antes de sincronizar
    
    Proceso:
        1. Obtiene lista de dispositivos de HA
        2. Compara con dispositivos en BD
        3. Crea nuevos, actualiza existentes, marca inactivos
    """
    try:
        # Obtener dispositivos de Home Assistant
        ha_devices = await ha_client.get_discovered_devices()
        ha_map = {item["entity_id"]: item for item in ha_devices if item.get("entity_id")}

        # Obtener dispositivos de la base de datos
        result = await db.execute(select(Device))
        db_devices = result.scalars().all()
        db_map = {device.entity_id: device for device in db_devices}

        created = 0
        updated = 0
        deactivated = 0

        # Procesar cada dispositivo de HA
        for entity_id, payload in ha_map.items():
            existing = db_map.get(entity_id)

            # Nuevo dispositivo: crear en BD
            if existing is None:
                db.add(
                    Device(
                        entity_id=entity_id,
                        name=payload.get("name") or entity_id,
                        device_type=payload.get("device_type") or "other",
                        unit=payload.get("unit"),
                        area_id=payload.get("area_id"),
                        visibility="public",
                        is_active=True,
                    )
                )
                created += 1
                continue

            # Dispositivo existente: verificar cambios
            changed = False

            new_name = payload.get("name") or entity_id
            new_type = payload.get("device_type") or "other"
            new_unit = payload.get("unit")
            new_area = payload.get("area_id")

            if existing.name != new_name:
                existing.name = new_name
                changed = True

            if existing.device_type != new_type:
                existing.device_type = new_type
                changed = True

            if existing.unit != new_unit:
                existing.unit = new_unit
                changed = True

            if existing.area_id != new_area:
                existing.area_id = new_area
                changed = True

            # Reactivar si estaba inactivo
            if not existing.is_active:
                existing.is_active = True
                changed = True

            if changed:
                updated += 1

        await db.commit()

        summary = {
            "created": created,
            "updated": updated,
            "deactivated": deactivated,
            "total_in_ha": len(ha_map),
            "total_in_db_before_sync": len(db_map),
        }
        logger.info("Device sync summary: %s", summary)
        return summary

    except Exception:
        await db.rollback()
        logger.exception("Error sincronizando dispositivos desde Home Assistant")
        raise