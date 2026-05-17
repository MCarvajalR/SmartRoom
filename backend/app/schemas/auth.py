"""
Schemas de autenticación y gestión de usuarios.

Define los esquemas Pydantic utilizados para validar y serializar
los datos de autenticación y usuarios en los endpoints de la API.
"""

from datetime import datetime

from pydantic import BaseModel


class LoginRequest(BaseModel):
    """
    Esquema para solicitud de inicio de sesión.
    
    Attributes:
        username: Nombre de usuario registrado
        password: Contraseña del usuario
    """
    username: str
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
        role: Rol del usuario (default: "anonimo")
    """
    username: str
    email: str
    password: str
    role: str = "anonimo"


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