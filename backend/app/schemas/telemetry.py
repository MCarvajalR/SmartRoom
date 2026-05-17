"""
Schemas de telemetría.

Define los esquemas Pydantic para validación y serialización
de datos de telemetría collectedos de los dispositivos.
"""

from datetime import datetime

from pydantic import BaseModel


class TelemetryResponse(BaseModel):
    """
    Esquema de un registro individual de telemetría.
    
    Attributes:
        id: Identificador único del registro
        device_id: ID del dispositivo asociado
        entity_id: ID de entidad en Home Assistant
        device_name: Nombre descriptivo del dispositivo
        value: Valor numérico parseado (nullable)
        raw_state: Estado original textual
        recorded_at: Timestamp del registro
    """
    id: int
    device_id: int
    entity_id: str
    device_name: str
    value: float | None
    raw_state: str
    recorded_at: datetime

    model_config = {"from_attributes": True}


class TelemetryLatest(BaseModel):
    """
    Esquema del último valor de telemetría de un dispositivo.
    
    Se utiliza para mostrar el estado actual de cada sensor.
    
    Attributes:
        device_id: ID del dispositivo
        entity_id: ID de entidad en Home Assistant
        device_name: Nombre del dispositivo
        device_type: Tipo de dispositivo
        unit: Unidad de medición
        value: Último valor numérico
        raw_state: Último estado textual
        recorded_at: Timestamp del último registro
    """
    device_id: int
    entity_id: str
    device_name: str
    device_type: str
    unit: str | None
    value: float | None
    raw_state: str
    recorded_at: datetime | None

    model_config = {"from_attributes": True}


class TelemetryLatest(BaseModel):
    """Último valor de telemetría de un dispositivo."""
    device_id: int
    entity_id: str
    device_name: str
    device_type: str
    unit: str | None
    value: float | None
    raw_state: str
    recorded_at: datetime | None