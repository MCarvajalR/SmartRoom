"""
Servicio de WebSocket hacia Home Assistant.

Flujo:
  1. Al arrancar la app, `start_ha_listener()` abre una conexión WS con HA.
  2. Se suscribe al evento `state_changed`.
  3. Cuando HA notifica un cambio de estado:
     a. Verifica si la entidad está registrada en DAMBA (tabla devices).
     b. Guarda el nuevo valor en la tabla telemetry.
     c. Hace broadcast a todos los clientes frontend conectados.
  4. Si la conexión se corta, reintenta automáticamente cada 5 segundos.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.exc import IntegrityError

# Ajusta estas rutas si tu proyecto tiene una estructura diferente
from app.core.config import settings
from app.core.database import AsyncSessionLocal          # o app.database
from app.models.device import Device                  # modelo SQLAlchemy
from app.models.telemetry import TelemetryRecord      # modelo SQLAlchemy

logger = logging.getLogger(__name__)

# Conjunto de conexiones WebSocket activas del frontend
_frontend_clients: set = set()


# ── Gestión de clientes frontend ──────────────────────────────────────────────

async def add_frontend_client(ws) -> None:
    _frontend_clients.add(ws)
    logger.info(f"Cliente WS conectado. Total: {len(_frontend_clients)}")


async def remove_frontend_client(ws) -> None:
    _frontend_clients.discard(ws)
    logger.info(f"Cliente WS desconectado. Total: {len(_frontend_clients)}")


async def broadcast_to_frontend(data: dict) -> None:
    """Envía un mensaje JSON a todos los clientes frontend conectados."""
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


# ── Procesamiento de eventos de HA ────────────────────────────────────────────

async def process_state_change(event_data: dict) -> None:
    EXCLUDED_PREFIXES = (
        "person.", "zone.", "sun.", "weather.", "tts.",
        "todo.", "conversation.", "event.", "sensor.backup_",
        "sensor.sun_", "update.", "sensor.sensors",
    )
    entity_id = event_data.get("entity_id", "")   # ← primero definir

    if not entity_id:
        return
    if any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):  # ← luego usar
        return
    

async def process_state_change(event_data: dict) -> None:
    """
    Recibe el payload de un evento state_changed de HA.
    Si la entidad está registrada en DAMBA: guarda en DB y hace broadcast.
    """
    EXCLUDED_PREFIXES = (
        "person.", "zone.", "sun.", "weather.", "tts.",
        "todo.", "conversation.", "event.", "sensor.backup_",
        "sensor.sun_", "update.", "sensor.sensors",
    )
    
    entity_id = event_data.get("entity_id", "")
    
    if any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):
        return  # ignorar entidades internas de HA
    
    new_state  = event_data.get("new_state")

    if not new_state:
        return
    if new_state.get("state") in ("unavailable", "unknown", ""):
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(
                Device.entity_id == entity_id,
            )
        )
        device = result.scalar_one_or_none()

        if device and not device.is_active:
            logger.debug(f"[ignorado] {entity_id} está registrado pero inactivo")
            return

        if not device:
            # Auto-registrar la entidad nueva como inactiva
            attrs = new_state.get("attributes", {})
            device_class = attrs.get("device_class", "")
            unit = attrs.get("unit_of_measurement")

            type_map = {
                "temperature": "temperature",
                "humidity":    "humidity",
                "power":       "plug",
                "energy":      "plug",
                "lock":        "lock",
                "illuminance": "light",
                "motion":      "binary_sensor",
            }
            device_type = type_map.get(device_class, entity_id.split(".")[0])

            device = Device(
                entity_id   = entity_id,
                name        = attrs.get("friendly_name", entity_id),
                device_type = device_type,
                unit        = unit,
                visibility  = "public",
                is_active   = False,
            )
            
            try:
                db.add(device)
                await db.commit()
                await db.refresh(device)
                logger.info(f"Nuevo dispositivo auto-registrado (inactivo): {entity_id}")
            except IntegrityError:
                await db.rollback()
                logger.debug(f"Race condition ignorada para: {entity_id}")
            return  # No guardar telemetría hasta que el admin lo active
            
            """ db.add(device)
            await db.commit()
            await db.refresh(device)
            logger.info(f"Nuevo dispositivo auto-registrado (inactivo): {entity_id}")
            return  # No guardar telemetría hasta que el admin lo active """

        raw_state = new_state["state"]
        try:
            value = float(raw_state)
        except (ValueError, TypeError):
            value = None

        # Guardar en telemetry
        record = TelemetryRecord(
            device_id  = device.id,
            value      = value,
            raw_state  = raw_state,
            recorded_at= datetime.now(timezone.utc),
        )
        db.add(record)
        await db.commit()

    # Broadcast en tiempo real al frontend
    await broadcast_to_frontend({
        "type":        "state_update",
        "device_id":   device.id,
        "entity_id":   entity_id,
        "device_name": device.name,
        "device_type": device.device_type,
        "unit":        device.unit,
        "value":       value,
        "raw_state":   raw_state,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "visibility":  device.visibility,
    })
    logger.debug(f"[RT] {entity_id} → {raw_state}")
    
    # Registrar en access_logs si es la puerta del laboratorio
    # Si en un futuro son más cerraduras, cambiar por una lista.
    DOOR_ENTITY_ID = "input_boolean.puerta_laboratorio_simulada"
    if entity_id == DOOR_ENTITY_ID:
        from app.models.access_log import AccessLog
        action = "unlock" if raw_state in ("on", "open", "unlocked") else "lock"
        async with AsyncSessionLocal() as log_db:
            log = AccessLog(
                entity_id    = entity_id,
                action       = action,
                triggered_by = "homeassistant",
            )
            log_db.add(log)
            await log_db.commit()
        logger.info(f"[ACCESS LOG] Puerta → {action} (desde HA)")


async def process_entity_registry_update(data: dict) -> None:
    """Registra o elimina dispositivos cuando cambia el registro de entidades en HA."""
    EXCLUDED_PREFIXES = (
        "person.", "zone.", "sun.", "weather.", "tts.",
        "todo.", "conversation.", "event.", "sensor.backup_",
        "sensor.sun_", "update.", "sensor.sensors",
    )
    action    = data.get("action")
    entity_id = data.get("entity_id", "")

    if not entity_id or any(entity_id.startswith(p) for p in EXCLUDED_PREFIXES):
        return

    async with AsyncSessionLocal() as db:

        if action == "create":
            result = await db.execute(select(Device).where(Device.entity_id == entity_id))
            if result.scalar_one_or_none():
                return  # ya existe

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

            type_map = {
                "temperature": "temperature", "humidity": "humidity",
                "power": "plug", "energy": "plug", "lock": "lock",
                "illuminance": "light", "motion": "binary_sensor",
            }
            device = Device(
                entity_id   = entity_id,
                name        = attrs.get("friendly_name", entity_id),
                device_type = type_map.get(attrs.get("device_class", ""), entity_id.split(".")[0]),
                unit        = attrs.get("unit_of_measurement"),
                visibility  = "public",
                is_active   = True,
            )
            try:
                db.add(device)
                await db.commit()
                logger.info(f"[REGISTRY] Nuevo dispositivo: {entity_id}")
            except IntegrityError:
                await db.rollback()

        elif action == "remove":
            result = await db.execute(select(Device).where(Device.entity_id == entity_id))
            device = result.scalar_one_or_none()
            if device:
                from app.models.telemetry import TelemetryRecord
                await db.execute(sa_delete(TelemetryRecord).where(
                    TelemetryRecord.device_id == device.id
                ))
                await db.delete(device)
                await db.commit()
                logger.info(f"[REGISTRY] Dispositivo eliminado: {entity_id}")

# ── Conexión persistente a HA ─────────────────────────────────────────────────

async def start_ha_listener() -> None:
    """
    Loop principal que mantiene la conexión WS con HA activa.
    Se llama una vez en el lifespan de FastAPI y corre en background.
    """
    #settings = get_settings()
    # Convierte http(s):// a ws(s)://
    ws_url = settings.HA_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = ws_url.rstrip("/") + "/api/websocket"

    while True:
        try:
            logger.info(f"Conectando a HA WebSocket: {ws_url}")
            async with websockets.connect(ws_url, ping_interval=30) as ha_ws:

                # 1. Handshake de autenticación
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
                    logger.error("Token de HA inválido — no se puede conectar")
                    return  # No reintentar si el token es incorrecto

                logger.info("✅ Autenticado en HA WebSocket")

                # Suscribirse a state_changed
                await ha_ws.send(json.dumps({
                    "id":         1,
                    "type":       "subscribe_events",
                    "event_type": "state_changed",
                }))
                sub_result = json.loads(await ha_ws.recv())
                logger.info(f"Suscripción a state_changed: {sub_result.get('type')}")

                # Suscripción a entity_registry_updated
                await ha_ws.send(json.dumps({
                    "id": 2, 
                    "type": "subscribe_events", 
                    "event_type": "entity_registry_updated",
                    }))
                resp = await ha_ws.recv()
                logger.info(f"Suscripción a entity_registry_updated: {json.loads(resp).get('type')}")

                # Escuchar eventos indefinidamente
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
                        logger.warning(f"Error procesando evento HA: {e}")

        except Exception as e:
            logger.warning(f"HA WebSocket desconectado ({e}). Reintentando en 5s...")
            await asyncio.sleep(5)
