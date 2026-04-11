from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Device(Base):
    """
    Dispositivo registrado en Home Assistant.
    Agregar un nuevo dispositivo = POST /api/v1/devices
    No hay que tocar código.
    """
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # entity_id exacto de Home Assistant (ej: "sensor.snzb02d_temperature")
    entity_id: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # Tipos: "temperature" | "humidity" | "plug" | "lock" | "light" | "other"
    device_type: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    unit: Mapped[str] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
