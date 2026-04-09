from fastapi import Request, HTTPException, status, Depends # Se agregó Depends aquí
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .auth_handler import decodeJWT

class JWTBearer(HTTPBearer):
    def __init__(self, auto_error: bool = True):
        super(JWTBearer, self).__init__(auto_error=auto_error)

    async def __call__(self, request: Request):
        credentials: HTTPAuthorizationCredentials = await super(JWTBearer, self).__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                raise HTTPException(status_code=403, detail="Esquema de autenticación inválido")
            
            payload = decodeJWT(credentials.credentials)
            if not payload:
                raise HTTPException(status_code=403, detail="Token inválido o expirado")
            
            return payload
        else:
            raise HTTPException(status_code=403, detail="Código de autenticación requerido")

# Función para verificar roles específicos
def RoleChecker(allowed_roles: list):
    # Se eliminó el prefijo "fastapi." ya que ahora Depends se usa directamente
    async def check(payload: dict = Depends(JWTBearer())): 
        if payload["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="No tienes permisos para realizar esta acción"
            )
        return payload
    return check