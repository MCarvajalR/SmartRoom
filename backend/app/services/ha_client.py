"""
Cliente HTTP para la API REST de Home Assistant.

Proporciona funciones asíncronas para interactuar con la API REST
de Home Assistant, incluyendo:
- Obtener estados de entidades individuales o todas
- Llamar a servicios de HA (turn_on, turn_off, lock, unlock, etc.)
- Verificar disponibilidad de HA
- Obtener áreas y mapeos entidad -> área
- Obtener dispositivos descubiertos con filtrado

El cliente usa httpx para requests HTTP asíncronos y maneja
errores de conexión de manera silenciosa (logging de advertencias).
"""

import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Prefijos de dominios de HA que son relevantes para el monitoreo
# Se incluyen sensores, switches, locks, luces, etc.
RELEVANT_PREFIXES = (
    "sensor.",
    "input_number.",
    "switch.",
    "binary_sensor.",
    "lock.",
    "light.",
    "climate.",
    "cover.",
)

# Prefijos de dominios a excluir del monitoreo
# Se excluyen personas, zonas, clima, TTS, etc.
EXCLUDED_PREFIXES = (
    "person.", "zone.", "sun.", "weather.", "tts.",
    "todo.", "conversation.", "event.", "sensor.backup_",
    "sensor.sun_", "update.", "sensor.sensors",
)

# Mapeo de device_class de HA a device_type de SmartRoom
# Los sensores pueden tener device_class que indica su tipo real
TYPE_MAP = {
    "temperature": "temperature",
    "humidity": "humidity",
    "power": "plug",
    "energy": "plug",
    "lock": "lock",
    "illuminance": "light",
    "motion": "binary_sensor",
}


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.HA_TOKEN}",
        "Content-Type": "application/json",
    }


async def get_state(entity_id: str) -> dict | None:
    url = f"{settings.HA_URL}/api/states/{entity_id}"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url, headers=_headers())
            if response.status_code == 200:
                return response.json()
            logger.warning("HA get_state %s -> HTTP %s", entity_id, response.status_code)
            return None
    except Exception as exc:
        logger.error("HA get_state error: %s", exc)
        return None


async def get_all_states() -> list[dict]:
    url = f"{settings.HA_URL}/api/states"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=_headers())
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, list) else []
    except Exception as exc:
        logger.error("HA get_all_states error: %s", exc)
        return []


async def call_service(domain: str, service: str, entity_id: str, extra: dict | None = None) -> bool:
    url = f"{settings.HA_URL}/api/services/{domain}/{service}"
    payload: dict = {"entity_id": entity_id}
    if extra:
        payload.update(extra)

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(url, headers=_headers(), json=payload)
            if response.status_code in (200, 201):
                return True
            logger.warning("HA call_service %s.%s -> HTTP %s", domain, service, response.status_code)
            return False
    except Exception as exc:
        logger.error("HA call_service error: %s", exc)
        return False


async def ha_is_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.HA_URL}/api/", headers=_headers())
            return resp.status_code == 200
    except Exception:
        return False


async def get_entities_with_areas() -> dict[str, str]:
    url = f"{settings.HA_URL}/api/template"
    payload = {
        "template": """
        {% set ns = namespace(items=[]) %}
        {% for area in areas() %}
          {% for entity in area_entities(area) %}
            {% set ns.items = ns.items + [{
              "entity_id": entity,
              "area_id": area
            }] %}
          {% endfor %}
        {% endfor %}
        {{ ns.items | to_json }}
        """
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=_headers(), json=payload)
            response.raise_for_status()

            text = response.text.strip()
            if not text:
                return {}

            data = json.loads(text)
            if not isinstance(data, list):
                return {}

            return {
                item["entity_id"]: item["area_id"]
                for item in data
                if isinstance(item, dict) and item.get("entity_id") and item.get("area_id")
            }
    except Exception as exc:
        logger.error("HA get_entities_with_areas error: %s", exc)
        return {}


async def get_areas() -> list[dict]:
    url = f"{settings.HA_URL}/api/template"
    payload = {
        "template": """
        {% set ns = namespace(items=[]) %}
        {% for area in areas() %}
          {% set ns.items = ns.items + [{
            "area_id": area,
            "name": area_name(area)
          }] %}
        {% endfor %}
        {{ ns.items | to_json }}
        """
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=_headers(), json=payload)
            response.raise_for_status()

            text = response.text.strip()
            if not text:
                return []

            data = json.loads(text)
            return data if isinstance(data, list) else []
    except Exception as exc:
        logger.error("HA get_areas error: %s", exc)
        return []


async def get_discovered_devices() -> list[dict]:
    states = await get_all_states()
    entity_area_map = await get_entities_with_areas()

    devices: list[dict] = []

    for state in states:
        entity_id = state.get("entity_id")
        if not entity_id:
            continue

        if any(entity_id.startswith(prefix) for prefix in EXCLUDED_PREFIXES):
            continue

        attrs = state.get("attributes", {})
        domain = entity_id.split(".")[0]
        device_class = attrs.get("device_class", "")

        device_type = TYPE_MAP.get(device_class, domain)

        devices.append(
            {
                "entity_id": entity_id,
                "name": attrs.get("friendly_name", entity_id),
                "device_type": device_type,
                "unit": attrs.get("unit_of_measurement"),
                "area_id": entity_area_map.get(entity_id),
                "visibility": "public",
                "state": state.get("state"),
            }
        )

    return devices


async def delete_entity(entity_id: str) -> bool:
    url = f"{settings.HA_URL}/api/states/{entity_id}"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.delete(url, headers=_headers())
            if response.status_code in (200, 204, 404):
                return True
            logger.warning("HA delete_entity %s -> HTTP %s", entity_id, response.status_code)
            return False
    except Exception as exc:
        logger.error("HA delete_entity error: %s", exc)
        return False