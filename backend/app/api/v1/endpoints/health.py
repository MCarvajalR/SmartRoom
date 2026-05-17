"""
Endpoint de verificación de estado de la aplicación.

Proporciona un endpoint de health check para verificar:
- Que la aplicación está funcionando
- Que puede conectarse a Home Assistant

Este endpoint es útil para load balancers, contenedores y
monitoreo de infraestructura.
"""

from fastapi import APIRouter

from app.services.ha_client import ha_is_available

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Verifica el estado de la aplicación y la conexión con Home Assistant.
    
    Returns:
        Dict con:
        - status: Siempre "ok" si el endpoint responde
        - home_assistant: "conectado" o "no disponible" según la conectividad
    """
    ha_ok = await ha_is_available()
    return {
        "status": "ok",
        "home_assistant": "conectado" if ha_ok else "no disponible",
    }