"""
Endpoint de verificación de estado de la aplicación.

Verifica la conectividad con Home Assistant.
"""

from fastapi import APIRouter

from app.services.ha_client import ha_is_available

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """Verifica el estado de la aplicación y la conexión con Home Assistant."""
    ha_ok = await ha_is_available()
    return {
        "status": "ok",
        "home_assistant": "conectado" if ha_ok else "no disponible",
    }