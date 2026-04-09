import os

class Settings:
    PROJECT_NAME: str = "Laboratorio Inteligente SCML"
    SECRET_KEY: str = "TU_LLAVE_SECRETA_SUPER_SEGURA_AQUI" # Cambiar por un hash real
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

settings = Settings()