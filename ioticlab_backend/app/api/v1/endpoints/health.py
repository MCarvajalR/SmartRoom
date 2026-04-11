from fastapi import APIRouter

from app.services.ha_client import ha_is_available

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    ha_ok = await ha_is_available()
    return {
        "status": "ok",
        "home_assistant": "conectado" if ha_ok else "no disponible",
    }
