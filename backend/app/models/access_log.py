"""
Modelo de registro de acceso a la puerta.

Almacena un historial de todos los eventos relacionados con el control
de acceso a la puerta del laboratorio, incluyendo bloqueos, desbloqueos
y consultas de estado.

Actions:
- lock: La puerta fue bloqueada
- unlock: La puerta fue desbloqueada
- query: Se consultó el estado de la puerta
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AccessLog(Base):
    """
    Representa un registro de evento de acceso a la puerta del laboratorio.
    
    Attributes:
        id: Identificador único del registro
        entity_id: ID de la entidad de la puerta en Home Assistant
        action: Tipo de acción realizada (lock, unlock, query)
        triggered_by: Username del usuario que ejecutó la acción
        triggered_at: Fecha y hora del evento (timezone UTC)
    """

    __tablename__ = "access_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_id: Mapped[str] = mapped_column(String(120), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    triggered_by: Mapped[str] = mapped_column(String(50), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )