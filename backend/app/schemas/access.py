"""
Schemas de control de acceso.

Define los esquemas Pydantic para validación y serialización
de datos relacionados con el control de acceso a la puerta.
"""

from datetime import datetime

from pydantic import BaseModel


class DoorStateResponse(BaseModel):
    """
    Esquema del estado actual de la puerta.
    
    Attributes:
        entity_id: ID de la entidad de la puerta en Home Assistant
        state: Estado de la puerta ("locked" o "unlocked")
        friendly_name: Nombre descriptivo de la entidad
    """
    entity_id: str
    state: str
    friendly_name: str | None


class AccessLogResponse(BaseModel):
    """
    Esquema de un registro de evento de acceso.
    
    Attributes:
        id: Identificador único del registro
        entity_id: ID de la entidad de la puerta
        action: Acción realizada (lock, unlock, query)
        triggered_by: Usuario que ejecutó la acción
        triggered_at: Fecha y hora del evento
    """
    id: int
    entity_id: str
    action: str
    triggered_by: str
    triggered_at: datetime

    model_config = {"from_attributes": True}