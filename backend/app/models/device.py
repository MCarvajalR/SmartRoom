"""
Modelo de dispositivo registrado desde Home Assistant.

Representa los dispositivos monitoreados que provienen de Home Assistant.
Cada dispositivo tiene un nivel de visibilidad que controla qué usuarios
pueden verlo.

Device Types:
- temperature: Sensores de temperatura
- humidity: Sensores de humedad
- plug: Enchufes inteligentes (power, energy)
- lock: Cerraduras
- light: Luces
- binary_sensor: Sensores binarios (motion)
- switch: Interruptores
- climate: Control de clima
- cover: Persianas/ventanas
- other: Otros tipos

Visibility Levels:
- public: Visible para todos
- docente: Visible para docentes y admins
- admin: Solo visible para admins
- private: Solo visible para admins
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Device(Base):
    """
    Representa un dispositivo registrado en Home Assistant.
    
    Attributes:
        id: Identificador único del dispositivo
        entity_id: ID de entidad en Home Assistant (ej: sensor.temperatura_1)
        name: Nombre descriptivo del dispositivo
        device_type: Tipo de dispositivo (temperature, humidity, plug, etc.)
        unit: Unidad de medición (°C, %, W, etc.)
        area_id: ID del área local de SmartRoom a la que pertenece
        is_active: Indica si el dispositivo está activo para monitoreo
        visibility: Nivel de visibilidad (public, docente, admin, private)
        created_at: Fecha de creación del registro
    """

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_id: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    device_type: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    unit: Mapped[str] = mapped_column(String(20), nullable=True)
    area_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="admin")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
