"""Clima exterior actual de Popayan obtenido desde Open-Meteo."""

import logging
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
POPAYAN_LATITUDE = 2.4448
POPAYAN_LONGITUDE = -76.6147

_cached_weather: dict | None = None
_cache_expires_at: datetime | None = None


def _condition_from_code(code: int) -> str:
    if code == 0:
        return "sunny"
    if code in (1, 2):
        return "partlycloudy"
    if code == 3:
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55, 56, 57, 61, 63, 66, 80, 81):
        return "rainy"
    if code in (65, 67, 82):
        return "pouring"
    if code in (71, 73, 75, 77, 85, 86):
        return "snowy"
    if code in (95, 96, 99):
        return "lightning-rainy"
    return "unknown"


async def get_popayan_weather() -> dict:
    """Retorna clima exterior actual, usando una cache corta para proteger la API."""
    global _cached_weather, _cache_expires_at

    now = datetime.now(timezone.utc)
    if _cached_weather and _cache_expires_at and now < _cache_expires_at:
        return _cached_weather

    params = {
        "latitude": POPAYAN_LATITUDE,
        "longitude": POPAYAN_LONGITUDE,
        "current": (
            "temperature_2m,relative_humidity_2m,apparent_temperature,"
            "is_day,precipitation,weather_code,cloud_cover,surface_pressure,"
            "wind_speed_10m,wind_direction_10m"
        ),
        "timezone": "America/Bogota",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            current = response.json().get("current", {})

        weather = {
            "location": "Popayan",
            "source": "Open-Meteo",
            "condition": _condition_from_code(int(current.get("weather_code", -1))),
            "is_day": bool(current.get("is_day", 1)),
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "apparent_temperature": current.get("apparent_temperature"),
            "cloud_coverage": current.get("cloud_cover"),
            "pressure": current.get("surface_pressure"),
            "precipitation": current.get("precipitation"),
            "wind_speed": current.get("wind_speed_10m"),
            "wind_direction": current.get("wind_direction_10m"),
            "recorded_at": current.get("time"),
            "available": True,
        }
        _cached_weather = weather
        _cache_expires_at = now + timedelta(minutes=5)
        return weather
    except Exception as exc:
        logger.warning("No fue posible consultar el clima exterior de Popayan: %s", exc)
        if _cached_weather:
            return {**_cached_weather, "available": False}
        return {
            "location": "Popayan",
            "source": "Open-Meteo",
            "condition": "unknown",
            "is_day": True,
            "temperature": None,
            "humidity": None,
            "apparent_temperature": None,
            "cloud_coverage": None,
            "pressure": None,
            "precipitation": None,
            "wind_speed": None,
            "wind_direction": None,
            "recorded_at": None,
            "available": False,
        }
