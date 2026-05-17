"""
Modelo de usuario del sistema.

Define la estructura de la tabla 'users' que almacena la información
de los usuarios del sistema de monitoreo. Cada usuario tiene un rol
que determina sus permisos de acceso.

Roles disponibles:
- admin: Acceso completo al sistema
- docente: Acceso a funciones de docente
- anonimo: Acceso público limitado
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """
    Representa un usuario del sistema de monitoreo.
    
    Attributes:
        id: Identificador único autoincremental
        username: Nombre de usuario único (máx 50 caracteres)
        email: Correo electrónico único (máx 120 caracteres)
        hashed_password: Hash bcrypt de la contraseña
        role: Rol del usuario (admin, docente, anonimo)
        is_active: Indica si el usuario puede iniciar sesión
        created_at: Fecha y hora de creación del usuario (timezone UTC)
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="anonimo")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )