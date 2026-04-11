from fastapi import APIRouter

from app.api.v1.endpoints import access, auth, devices, health, telemetry, ws, discover

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(devices.router)
api_router.include_router(telemetry.router)
api_router.include_router(access.router)
api_router.include_router(ws.router)                             # WebSocket /ws/telemetry
api_router.include_router(                                       # Auto-discovery
    discover.router,
    prefix="/api/v1/devices",
    tags=["Devices"]
)