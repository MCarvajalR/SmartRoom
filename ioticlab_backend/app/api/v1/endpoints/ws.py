"""
Endpoint WebSocket para el frontend Angular.

El frontend se conecta a ws://localhost:8000/api/v1/ws/telemetry
y recibe actualizaciones en tiempo real cada vez que HA reporta
un cambio de estado en un dispositivo registrado en DAMBA.

Mensaje que recibe el frontend:
{
  "type":        "state_update",
  "device_id":   1,
  "entity_id":   "input_number.temp_simulada",
  "device_name": "Temperatura Simulada",
  "device_type": "temperature",
  "unit":        "°C",
  "value":       23.5,
  "raw_state":   "23.5",
  "recorded_at": "2026-04-11T14:35:00+00:00",
  "visibility":  "public"
}
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.ha_websocket import add_frontend_client, remove_frontend_client

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    await websocket.accept()
    await add_frontend_client(websocket)
    try:
        # Mantener la conexión viva esperando mensajes (ping del cliente)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await remove_frontend_client(websocket)
    except Exception:
        await remove_frontend_client(websocket)
