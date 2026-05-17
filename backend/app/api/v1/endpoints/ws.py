"""
Endpoint WebSocket para transmisión de telemetría en tiempo real.

El frontend se conecta a este endpoint para recibir actualizaciones
instantáneas de los dispositivos cuando Home Assistant reporta cambios
de estado. El servidor actúa como proxy entre HA y el frontend.

Formato de mensajes transmitidos:
{
    "type": "state_update",
    "device_id": 1,
    "entity_id": "sensor.temp_1",
    "device_name": "Temperatura",
    "device_type": "temperature",
    "unit": "°C",
    "value": 25.5,
    "raw_state": "25.5",
    "recorded_at": "2024-01-15T10:30:00Z",
    "visibility": "public"
}

El cliente frontend debe mantener la conexión abierta para recibir
actualizaciones en tiempo real. El servidor maneja la reconexión
automática con Home Assistant si se interrumpe la conexión.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ha_websocket import add_frontend_client, remove_frontend_client

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    """
    WebSocket para recibir actualizaciones de telemetría en tiempo real.
    
    El servidor transmite mensajes 'state_update' cada vez que
    Home Assistant reporta un cambio de estado de un dispositivo.
    
    El endpoint:
    1. Acepta la conexión WebSocket del cliente
    2. Registra el cliente en la lista de clientes activos
    3. Mantiene la conexión abierta esperando mensajes (aunque no los procesa)
    4. Elimina el cliente de la lista al desconectarse
    
    No requiere autenticación en este endpoint (el WS es abierto).
    """
    await websocket.accept()
    await add_frontend_client(websocket)
    try:
        # Mantener la conexión activa - el servidor solo envía, no recibe
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await remove_frontend_client(websocket)
    except Exception:
        await remove_frontend_client(websocket)