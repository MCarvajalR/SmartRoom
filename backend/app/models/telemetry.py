"""
Modelo de registro de telemetría.

Almacena los valores capturados de los dispositivos en puntos
específicos en el tiempo. Cada registro representa una lectura
de un sensor o estado de un dispositivo.

El campo 'value' es el valor numérico parseado, mientras que
'raw_state' guarda el estado original tal como viene de Home Assistant
(útil para estados no numéricos como 'on', 'off', 'unavailable').
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TelemetryRecord(Base):
    """
    Representa un registro de telemetría de un dispositivo.
    
    Attributes:
        id: Identificador único del registro
        device_id: Referencia al dispositivo (FK a devices.id)
        value: Valor numérico del sensor (nullable, puede ser None para estados no numéricos)
        raw_state: Estado original textual (ej: 'on', 'off', '25.5', 'unavailable')
        recorded_at: Timestamp del registro (indexado para búsquedas rápidas)
    """

    __tablename__ = "telemetry_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"), nullable=False, index=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_state: Mapped[str] = mapped_column(String(50), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
