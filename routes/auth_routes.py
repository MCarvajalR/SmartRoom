from fastapi import APIRouter, HTTPException, status
from models.schemas import UserLogin, TokenSchema
from auth.auth_handler import signJWT
from utils.hashing import Hasher

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# SIMULACIÓN DE BASE DE DATOS (En el futuro usarás SQL)
fake_db_user = {
    "username": "admin_lab",
    "password": Hasher.get_password_hash("admin123"),
    "role": "admin"
}

@router.post("/login", response_model=TokenSchema)
async def login(user: UserLogin):
    if user.username == fake_db_user["username"] and \
       Hasher.verify_password(user.password, fake_db_user["password"]):
        return signJWT(user.username, fake_db_user["role"])
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales incorrectas"
    )