"""
Servicio de comunicación WebSocket con Home Assistant.

Este módulo conecta el backend con Home Assistant mediante WebSocket,
procesando eventos de cambios de estado y transmitiéndolos al frontend
en tiempo real a través de otro WebSocket.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.device import Device
from app.models.telemetry import TelemetryRecord

logger = logging.getLogger(__name__)

# Clientes WebSocket conectados desde el frontend
_frontend_clients: set = set()

# Prefijos de entidades de HA que se ignoran
EXCLUDED_PREFIXES = (
    "person.", "zone.", "sun.", "weather.", "tts.",
    "todo.", "conversation.", "event.", "sensor.backup_",
    "sensor.sun_", "update.", "sensor.sensors",
)

# Mapeo de device_class de HA a device_type de SmartRoom
TYPE_MAP = {
    "temperature": "temperature",
    "humidity": "humidity",
    "power": "plug",
    "energy": "plug",
    "lock": "lock",
    "illuminance": "light",
    "motion": "binary_sensor",
}


async def add_frontend_client(ws) -> None:
    """Registra un nuevo cliente WebSocket del frontend."""
    _frontend_clients.add(ws)
    logger.info("Cliente WS conectado. Total: %d", len(_frontend_clients))


async def remove_frontend_client(ws) -> None:
    """Elimina un cliente WebSocket del frontend."""
    _frontend_clients.discard(ws)
    logger.info("Cliente WS desconectado. Total: %d", len(_frontend_clients))


async def broadcast_to_frontend(data: dict) -> None:
    """Envía un mensaje JSON a todos los clientes del frontend conectados."""
    if not _frontend_clients:
        return

    msg = json.dumps(data, default=str)
    dead: set = set()

    for ws in list(_frontend_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)

    _frontend_clients.difference_update(dead)


async def process_state_change(event_data: dict) -> None:
    """
    Procesa un evento de cambio de estado recibido de Home Assistant.
    
    Si la entidad está registrada como dispositivo activo, guarda el nuevo
    valor en la base de datos y transmite la actualización al frontend.
    """
    entity_id = event_data.get("entity_id", "")
    if not entity_id or any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):
        return

    new_state = event_data.get("new_state")
    if not new_state or new_state.get("state") in ("unavailable", "unknown", ""):
        return

    raw_state = new_state["state"]
    try:
        value = float(raw_state)
    except (ValueError, TypeError):
        value = None

    broadcast_payload = None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device).where(Device.entity_id == entity_id))
        device = result.scalar_one_or_none()

        if device and not device.is_active:
            logger.debug("[ignorado] %s inactivo", entity_id)
            return

        if not device:
            attrs = new_state.get("attributes", {})
            device_class = attrs.get("device_class", "")

            device = Device(
                entity_id=entity_id,
                name=attrs.get("friendly_name", entity_id),
                device_type=TYPE_MAP.get(device_class, entity_id.split(".")[0]),
                unit=attrs.get("unit_of_measurement"),
                visibility="public",
                is_active=False,
            )
            try:
                db.add(device)
                await db.commit()
                logger.info("Auto-registrado (inactivo): %s", entity_id)
            except IntegrityError:
                await db.rollback()
            return

        record = TelemetryRecord(
            device_id=device.id,
            value=value,
            raw_state=raw_state,
            recorded_at=datetime.now(timezone.utc),
        )
        db.add(record)
        await db.commit()

        broadcast_payload = {
            "type": "state_update",
            "device_id": device.id,
            "entity_id": entity_id,
            "device_name": device.name,
            "device_type": device.device_type,
            "unit": device.unit,
            "value": value,
            "raw_state": raw_state,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "visibility": device.visibility,
        }

    if broadcast_payload:
        await broadcast_to_frontend(broadcast_payload)
        logger.info("[RT] %s → %s", entity_id, raw_state)

    DOOR_ENTITY_ID = "input_boolean.puerta_laboratorio_simulada"
    if entity_id == DOOR_ENTITY_ID:
        from app.models.access_log import AccessLog

        action = "unlock" if raw_state in ("on", "open", "unlocked") else "lock"
        async with AsyncSessionLocal() as log_db:
            log_db.add(AccessLog(
                entity_id=entity_id,
                action=action,
                triggered_by="homeassistant",
            ))
            await log_db.commit()
        logger.info("[ACCESS LOG] Puerta → %s", action)


async def process_entity_registry_update(data: dict) -> None:
    """
    Registra o elimina dispositivos cuando cambia el registro de entidades en HA.
    
    Se ejecuta cuando HA notifica cambios en su registro de entidades.
    """
    action = data.get("action")
    entity_id = data.get("entity_id", "")

    if not entity_id or any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):
        return

    async with AsyncSessionLocal() as db:
        if action == "create":
            result = await db.execute(select(Device).where(Device.entity_id == entity_id))
            if result.scalar_one_or_none():
                return

            import httpx
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{settings.HA_URL}/api/states/{entity_id}",
                        headers={"Authorization": f"Bearer {settings.HA_TOKEN}"},
                        timeout=5,
                    )
                    attrs = resp.json().get("attributes", {}) if resp.status_code == 200 else {}
            except Exception:
                attrs = {}

            device = Device(
                entity_id=entity_id,
                name=attrs.get("friendly_name", entity_id),
                device_type=TYPE_MAP.get(attrs.get("device_class", ""), entity_id.split(".")[0]),
                unit=attrs.get("unit_of_measurement"),
                visibility="public",
                is_active=True,
            )
            try:
                db.add(device)
                await db.commit()
                logger.info("[REGISTRY] Nuevo dispositivo: %s", entity_id)
            except IntegrityError:
                await db.rollback()

        elif action == "remove":
            result = await db.execute(select(Device).where(Device.entity_id == entity_id))
            device = result.scalar_one_or_none()
            if device:
                await db.execute(sa_delete(TelemetryRecord).where(
                    TelemetryRecord.device_id == device.id
                ))
                await db.delete(device)
                await db.commit()
                logger.info("[REGISTRY] Dispositivo eliminado: %s", entity_id)


async def start_ha_listener() -> None:
    """
    Mantiene la conexión WebSocket con Home Assistant activa.
    
    Este loop se ejecuta en background al iniciar la aplicación.
    En caso de desconexión, reintenta automáticamente cada 5 segundos.
    """
    ws_url = settings.HA_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = ws_url.rstrip("/") + "/api/websocket"

    while True:
        try:
            logger.info("Conectando a HA WebSocket: %s", ws_url)
            async with websockets.connect(ws_url, ping_interval=30) as ha_ws:
                auth_req = json.loads(await ha_ws.recv())
                if auth_req.get("type") != "auth_required":
                    logger.error("Respuesta inesperada de HA en la conexión inicial")
                    break

                await ha_ws.send(json.dumps({
                    "type": "auth",
                    "access_token": settings.HA_TOKEN,
                }))

                auth_result = json.loads(await ha_ws.recv())
                if auth_result.get("type") != "auth_ok":
                    logger.error("Token de HA inválido")
                    return

                logger.info("Autenticado en HA WebSocket")

                await ha_ws.send(json.dumps({
                    "id": 1,
                    "type": "subscribe_events",
                    "event_type": "state_changed",
                }))
                json.loads(await ha_ws.recv())

                await ha_ws.send(json.dumps({
                    "id": 2,
                    "type": "subscribe_events",
                    "event_type": "entity_registry_updated",
                }))
                json.loads(await ha_ws.recv())

                async for raw in ha_ws:
                    try:
                        msg = json.loads(raw)
                        if msg.get("type") != "event":
                            continue
                        event_type = msg["event"].get("event_type")
                        event_data = msg["event"].get("data", {})

                        if event_type == "state_changed":
                            await process_state_change(event_data)
                        elif event_type == "entity_registry_updated":
                            await process_entity_registry_update(event_data)

                    except Exception as e:
                        logger.warning("Error procesando evento HA: %s", e)

        except Exception as e:
            logger.warning("HA WebSocket desconectado (%s). Reintentando en 5s...", e)
            await asyncio.sleep(5)