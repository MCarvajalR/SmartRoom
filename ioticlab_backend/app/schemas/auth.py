"""Schemas de autenticación y gestión de usuarios."""

from datetime import datetime

from pydantic import BaseModel


class LoginRequest(BaseModel):
    """Solicitud de inicio de sesión."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """Respuesta de autenticación con token JWT."""
    access_token: str
    token_type: str = "bearer"
    role: str


class UserCreate(BaseModel):
    """Datos para crear un nuevo usuario."""
    username: str
    email: str
    password: str
    role: str = "anonimo"


class UserResponse(BaseModel):
    """Datos de usuario retornados por la API."""
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}