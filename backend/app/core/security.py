"""
Utilidades de seguridad para autenticación y autorización.

Proporciona funciones para:
- Hashing de contraseñas con bcrypt (seguro)
- Verificación de contraseñas contra su hash
- Creación de tokens JWT con expiración
- Decodificación y validación de tokens JWT

Seguridad:
- Las contraseñas nunca se almacenan en texto plano
- JWT usa HS256 con clave configurable
- Tokens expiran después de JWT_EXPIRE_MINUTES (default: 8 horas)
"""

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(plain: str) -> str:
    """
    Hashea una contraseña en texto plano usando bcrypt.
    
    Args:
        plain: Contraseña en texto plano
    
    Returns:
        Hash de la contraseña (listo para almacenar en BD)
    
    Nota:
        bcrypt genera su propio salt automáticamente
    """
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verifica una contraseña contra su hash bcrypt.
    
    Args:
        plain: Contraseña en texto plano a verificar
        hash: Hash almacenado en la base de datos
    
    Returns:
        True si la contraseña es correcta, False otherwise
    """
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    """
    Crea un token JWT con los datos proporcionados.
    
    Args:
        data: Dict con los datos a incluir en el token
              (debe incluir al menos "sub" con el user_id)
    
    Returns:
        Token JWT codificado
    
    El token incluye:
    - Los datos proporcionados (sub, role, etc.)
    - exp: Tiempo de expiración desde settings.JWT_EXPIRE_MINUTES
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload["exp"] = expire
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """
    Decodifica y valida un token JWT.
    
    Args:
        token: Token JWT a decodificar
    
    Returns:
        Payload del token si es válido, None si es inválido/expirado
    
    Raises:
        No lanza excepciones, retorna None en caso de error
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None