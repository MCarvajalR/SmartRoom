"""
Endpoints de autenticación y gestión de usuarios.

Proporciona endpoints para:
- Login de usuarios con verificación de credenciales
- Obtención del usuario actual desde el token JWT
- Gestión de usuarios (CRUD solo para administradores)

Autenticación:
- Los endpoints de login y /me no requieren autenticación previa
- Los endpoints de gestión de usuarios requieren rol 'admin'
- El token JWT debe incluirse en el header: Authorization: Bearer <token>
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Autentica un usuario y retorna un token JWT.
    
    Args:
        payload: LoginRequest con username y password
    
    Returns:
        TokenResponse con access_token, token_type y role
    
    Raises:
        401: Credenciales incorrectas o usuario inactivo
    """
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()

    # Verificar credenciales
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    # Generar token JWT con el ID y rol del usuario
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    """
    Retorna la información del usuario autenticado.
    
    Requires:
        Token JWT válido en el header Authorization
    
    Returns:
        UserResponse con los datos del usuario actual
    """
    return current_user


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """
    Crea un nuevo usuario en el sistema.
    
    Requires:
        Rol 'admin' en el token JWT
    
    Args:
        payload: UserCreate con username, email, password y role
    
    Returns:
        UserResponse con los datos del usuario creado
    
    Raises:
        409: Si el nombre de usuario ya existe
    """
    # Verificar que el username no exista
    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")

    # Crear usuario con contraseña hasheada
    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    """
    Lista todos los usuarios del sistema.
    
    Requires:
        Rol 'admin' en el token JWT
    
    Returns:
        Lista de UserResponse con todos los usuarios
    """
    result = await db.execute(select(User))
    return result.scalars().all()


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Elimina un usuario por su ID.
    
    Require:
        Rol 'admin' en el token JWT
    
    Args:
        user_id: ID del usuario a eliminar
    
    Raises:
        404: Si el usuario no existe
        400: Si el admin intenta eliminarse a sí mismo
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    await db.delete(user)
    await db.commit()