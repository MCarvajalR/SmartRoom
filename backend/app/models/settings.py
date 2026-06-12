"""
Modelo de configuración del sistema.

Almacena la configuración global de la aplicación. Solo existe
un registro (id=1) que contiene los parámetros ajustables del sistema.

Configuraciones disponibles:
- telemetry_interval_seconds: Frecuencia de recolección de telemetría (en segundos)
- door_entity_id: Entity ID de la cerradura/puerta del laboratorio en Home Assistant
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Settings(Base):
    """
    Representa la configuración global del sistema.
    
    Attributes:
        id: Identificador (siempre 1, configuración única)
        telemetry_interval_seconds: Intervalo de recolección de telemetría en segundos
        door_entity_id: Entity ID de la puerta en Home Assistant
        updated_at: Fecha de última modificación de la configuración
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    telemetry_interval_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    telemetry_retention_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    telemetry_retention_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    door_entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
