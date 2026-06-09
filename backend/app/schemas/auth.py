"""
Schemas de autenticación y gestión de usuarios.

Define los esquemas Pydantic utilizados para validar y serializar
los datos de autenticación y usuarios en los endpoints de la API.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

INSTITUTIONAL_DOMAIN = "@unicauca.edu.co"


def validate_institutional_email(value: str) -> str:
    normalized = value.strip().lower()
    local_part, separator, domain = normalized.partition("@")
    if not separator or not local_part or f"@{domain}" != INSTITUTIONAL_DOMAIN:
        raise ValueError("El correo debe pertenecer al dominio @unicauca.edu.co")
    return normalized


def validate_password_policy(value: str) -> str:
    if len(value) < 8:
        raise ValueError("La contraseña debe tener mínimo 8 caracteres")
    if not any(char.isupper() for char in value):
        raise ValueError("La contraseña debe incluir una letra mayúscula")
    if not any(char.islower() for char in value):
        raise ValueError("La contraseña debe incluir una letra minúscula")
    if not any(char.isdigit() for char in value):
        raise ValueError("La contraseña debe incluir un número")
    return value


class LoginRequest(BaseModel):
    """
    Esquema para solicitud de inicio de sesión.
    
    Attributes:
        username: Nombre de usuario registrado
        password: Contraseña del usuario
    """
    identifier: str
    password: str


class TokenResponse(BaseModel):
    """
    Esquema de respuesta después de autenticación exitosa.
    
    Attributes:
        access_token: Token JWT para sesiones autenticadas
        token_type: Tipo de token (siempre "bearer")
        role: Rol del usuario autenticado
    """
    access_token: str
    token_type: str = "bearer"
    role: str


class UserCreate(BaseModel):
    """
    Esquema para crear un nuevo usuario.
    
    Attributes:
        username: Nombre de usuario único
        email: Correo electrónico único
        password: Contraseña en texto plano (se hashea antes de guardar)
        role: Rol asignado al usuario
    """
    username: str
    email: str
    password: str
    role: Literal["admin", "docente"] = "docente"

    @field_validator("email")
    @classmethod
    def institutional_email(cls, value: str) -> str:
        return validate_institutional_email(value)

    @field_validator("password")
    @classmethod
    def secure_password(cls, value: str) -> str:
        return validate_password_policy(value)


class UserUpdate(BaseModel):
    """Campos editables de una cuenta de usuario."""

    username: str | None = None
    email: str | None = None
    password: str | None = None
    role: Literal["admin", "docente"] | None = None
    is_active: bool | None = None

    @field_validator("email")
    @classmethod
    def institutional_email(cls, value: str | None) -> str | None:
        return validate_institutional_email(value) if value is not None else value

    @field_validator("password")
    @classmethod
    def secure_password(cls, value: str | None) -> str | None:
        return validate_password_policy(value) if value else value


class ProfileUpdate(BaseModel):
    """Campos que un usuario puede modificar sobre su propia cuenta."""

    username: str | None = None
    email: str | None = None
    current_password: str | None = None
    new_password: str | None = None

    @field_validator("email")
    @classmethod
    def institutional_email(cls, value: str | None) -> str | None:
        return validate_institutional_email(value) if value is not None else value

    @field_validator("new_password")
    @classmethod
    def secure_password(cls, value: str | None) -> str | None:
        return validate_password_policy(value) if value else value


class UserResponse(BaseModel):
    """
    Esquema de respuesta con datos del usuario.
    
    Attributes:
        id: Identificador único del usuario
        username: Nombre de usuario
        email: Correo electrónico
        role: Rol del usuario
        is_active: Indica si el usuario está activo
        created_at: Fecha de creación del usuario
    """
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
