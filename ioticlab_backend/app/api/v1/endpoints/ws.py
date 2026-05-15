"""
Endpoint WebSocket para transmisión de telemetría en tiempo real.

El frontend se conecta a este endpoint para recibir actualizaciones
instantáneas de los dispositivos cuando Home Assistant reporta cambios.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ha_websocket import add_frontend_client, remove_frontend_client

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    """
    WebSocket para recibir actualizaciones de telemetría en tiempo real.
    
    El servidor transmite mensajes tipo 'state_update' cada vez que
    Home Assistant reporta un cambio de estado de un dispositivo.
    """
    await websocket.accept()
    await add_frontend_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await remove_frontend_client(websocket)
    except Exception:
        await remove_frontend_client(websocket)