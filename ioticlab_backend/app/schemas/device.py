"""Schemas de dispositivos."""

from datetime import datetime

from pydantic import BaseModel


class DeviceCreate(BaseModel):
    """Datos para crear un nuevo dispositivo."""
    entity_id: str
    name: str
    device_type: str = "other"
    unit: str | None = None
    visibility: str = "public"


class DeviceUpdate(BaseModel):
    """Datos para actualizar un dispositivo existente."""
    name: str | None = None
    device_type: str | None = None
    unit: str | None = None
    is_active: bool | None = None
    visibility: str | None = None


class DeviceResponse(BaseModel):
    """Datos de dispositivo retornados por la API."""
    id: int
    entity_id: str
    name: str
    device_type: str
    unit: str | None
    is_active: bool
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}