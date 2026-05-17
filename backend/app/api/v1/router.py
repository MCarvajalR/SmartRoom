"""
Router principal de la API v1.

Agrega todos los routers de endpoints bajo el prefijo /api/v1.

Estructura de endpoints:
- /api/v1/health         -> Health check
- /api/v1/auth           -> Autenticación y gestión de usuarios
- /api/v1/devices        -> CRUD de dispositivos
- /api/v1/telemetry      -> Datos de telemetría
- /api/v1/access         -> Control de acceso a la puerta
- /api/v1/ws/telemetry   -> WebSocket para tiempo real
- /api/v1/devices/discover -> Descubrimiento de dispositivos
- /api/v1/settings       -> Configuración del sistema
"""

from fastapi import APIRouter

from app.api.v1.endpoints import access, auth, devices, health, telemetry, ws, discover, settings

api_router = APIRouter(prefix="/api/v1")

# Health check - verificación de estado
api_router.include_router(health.router)

# Autenticación - login, usuario actual, gestión de usuarios
api_router.include_router(auth.router)

# Dispositivos - CRUD, listado, agrupamiento por área
api_router.include_router(devices.router)

# Telemetría - último valor, historial, recolección manual
api_router.include_router(telemetry.router)

# Control de acceso - puerta, bloque/desbloqueo, logs
api_router.include_router(access.router)

# WebSocket - transmisión en tiempo real de telemetría
api_router.include_router(ws.router)

# Descubrimiento - listar entidades HA, importar, sincronizar
# Se anida bajo /devices para mantener coherencia REST
api_router.include_router(
    discover.router,
    prefix="/devices",
    tags=["Devices"]
)

# Configuración - settings globales, historial por dispositivo
api_router.include_router(settings.router)