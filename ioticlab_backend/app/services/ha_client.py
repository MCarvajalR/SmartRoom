"""
Cliente HTTP para la API REST de Home Assistant.

Proporciona funciones para:
- Obtener estados de entidades
- Llamar a servicios de HA
- Verificar disponibilidad de HA

Documentación de la API: https://developers.home-assistant.io/docs/api/rest/
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _headers() -> dict:
    """Genera headers de autenticación para Home Assistant."""
    return {
        "Authorization": f"Bearer {settings.HA_TOKEN}",
        "Content-Type": "application/json",
    }


async def get_state(entity_id: str) -> dict | None:
    """
    Obtiene el estado actual de una entidad en Home Assistant.
    
    Args:
        entity_id: Identificador de la entidad (ej: 'sensor.temperatura')
    
    Returns:
        JSON completo del estado o None si hay error.
    """
    url = f"{settings.HA_URL}/api/states/{entity_id}"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url, headers=_headers())
            if response.status_code == 200:
                return response.json()
            logger.warning("HA get_state %s → HTTP %s", entity_id, response.status_code)
            return None
    except Exception as exc:
        logger.error("HA get_state error: %s", exc)
        return None


async def call_service(domain: str, service: str, entity_id: str, extra: dict | None = None) -> bool:
    """
    Llama a un servicio de Home Assistant.
    
    Args:
        domain: Dominio del servicio (ej: 'lock', 'switch', 'input_boolean')
        service: Nombre del servicio (ej: 'lock', 'turn_on', 'turn_off')
        entity_id: Entidad sobre la que ejecutar el servicio
        extra: Parámetros adicionales opcionales
    
    Returns:
        True si el servicio se ejecutó correctamente.
    """
    url = f"{settings.HA_URL}/api/services/{domain}/{service}"
    payload: dict = {"entity_id": entity_id}
    if extra:
        payload.update(extra)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(url, headers=_headers(), json=payload)
            if response.status_code in (200, 201):
                return True
            logger.warning("HA call_service %s.%s → HTTP %s", domain, service, response.status_code)
            return False
    except Exception as exc:
        logger.error("HA call_service error: %s", exc)
        return False


async def ha_is_available() -> bool:
    """Verifica si Home Assistant está disponible."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.HA_URL}/api/", headers=_headers())
            return resp.status_code == 200
    except Exception:
        return False