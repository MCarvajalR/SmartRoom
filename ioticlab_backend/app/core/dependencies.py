"""
Dependencias FastAPI para autenticación y autorización.

Proporciona funciones de dependency injection para:
- Sesiones de base de datos
- Obtención del usuario actual desde token JWT
- Verificación de roles
- Control de visibilidad según rol
"""

from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Proporciona una sesión de base de datos."""
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Obtiene el usuario actual a partir del token JWT."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    user_id: int | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token mal formado")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")
    return user


def require_roles(*roles: str):
    """
    Generador de dependencias para verificar roles.
    
    Uso: require_roles('admin', 'docente')
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Roles permitidos: {list(roles)}",
            )
        return current_user
    return _check


bearer_scheme_optional = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Obtiene el usuario actual si existe token válido, o None si no hay token."""
    if not credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    return user if (user and user.is_active) else None


def get_visible_levels(user: User | None) -> list[str]:
    """
    Retorna los niveles de visibilidad accesibles según el rol del usuario.
    
    - Anónimo: solo 'public'
    - Docente: 'public', 'docente'
    - Admin: todos los niveles
    """
    if user is None:
        return ["public"]
    if user.role == "admin":
        return ["public", "docente", "admin", "private"]
    if user.role == "docente":
        return ["public", "docente"]
    return ["public"]