"""Areas de Home Assistant que SmartRoom no debe volver a importar."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SuppressedHAArea(Base):
    """Guarda una decision local de eliminar/ignorar un area sugerida por HA."""

    __tablename__ = "suppressed_ha_areas"

    area_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
