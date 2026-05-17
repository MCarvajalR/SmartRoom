"""
Schemas de dispositivos.

Define los esquemas Pydantic para validación y serialización
de datos de dispositivos en la API REST.
"""

from datetime import datetime

from pydantic import BaseModel


class DeviceCreate(BaseModel):
    """
    Esquema para crear un nuevo dispositivo.
    
    Attributes:
        entity_id: ID de entidad en Home Assistant (ej: sensor.temp_1)
        name: Nombre descriptivo del dispositivo
        device_type: Tipo de dispositivo (default: "other")
        unit: Unidad de medición (ej: "°C", "%")
        area_id: ID del área en Home Assistant
        visibility: Nivel de visibilidad (default: "public")
    """
    entity_id: str
    name: str
    device_type: str = "other"
    unit: str | None = None
    area_id: str | None = None
    visibility: str = "public"


class DeviceUpdate(BaseModel):
    """
    Esquema para actualizar un dispositivo existente.
    
    Todos los campos son opcionales para permitir actualizaciones parciales.
    
    Attributes:
        name: Nuevo nombre del dispositivo
        device_type: Nuevo tipo de dispositivo
        unit: Nueva unidad de medición
        area_id: Nueva área
        is_active: Estado activo/inactivo
        visibility: Nuevo nivel de visibilidad
    """
    name: str | None = None
    device_type: str | None = None
    unit: str | None = None
    area_id: str | None = None
    is_active: bool | None = None
    visibility: str | None = None


class DeviceResponse(BaseModel):
    """
    Esquema de respuesta con datos completos del dispositivo.
    
    Attributes:
        id: Identificador único del dispositivo
        entity_id: ID de entidad en Home Assistant
        name: Nombre descriptivo
        device_type: Tipo de dispositivo
        unit: Unidad de medición
        area_id: Área a la que pertenece
        is_active: Indica si está activo
        visibility: Nivel de visibilidad
        created_at: Fecha de creación
    """
    id: int
    entity_id: str
    name: str
    device_type: str
    unit: str | None
    area_id: str | None
    is_active: bool
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AreaDeviceHybridOut(BaseModel):
    """
    Esquema de dispositivo para respuestas agrupadas por área.
    
    Añade el campo 'source' para indicar de dónde viene el dispositivo.
    
    Attributes:
        id: ID del dispositivo (nullable si viene de HA pero no está en BD)
        entity_id: ID de entidad
        name: Nombre descriptivo
        device_type: Tipo de dispositivo
        unit: Unidad de medición
        area_id: Área del dispositivo
        is_active: Estado activo
        visibility: Nivel de visibilidad
        created_at: Fecha de creación
        source: Origen del dispositivo ("db" = base de datos local)
    """
    id: int | None = None
    entity_id: str
    name: str
    device_type: str
    unit: str | None = None
    area_id: str | None = None
    is_active: bool = True
    visibility: str = "public"
    created_at: datetime | None = None
    source: str = "db"

    model_config = {"from_attributes": True}


class DevicesByAreaHybridOut(BaseModel):
    """
    Esquema para dispositivos agrupados por área.
    
    Attributes:
        area_id: ID del área
        area_name: Nombre descriptivo del área
        devices: Lista de dispositivos en esa área
    """
    area_id: str
    area_name: str
    devices: list[AreaDeviceHybridOut]