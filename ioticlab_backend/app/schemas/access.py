"""Schemas de control de acceso."""

from datetime import datetime

from pydantic import BaseModel


class DoorStateResponse(BaseModel):
    """Estado actual de la puerta."""
    entity_id: str
    state: str
    friendly_name: str | None


class AccessLogResponse(BaseModel):
    """Registro de evento de acceso."""
    id: int
    entity_id: str
    action: str
    triggered_by: str
    triggered_at: datetime

    model_config = {"from_attributes": True}