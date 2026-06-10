"""
Configuración centralizada de la aplicación.

Carga las variables de entorno desde el archivo .env y proporciona
valores por defecto para el entorno de desarrollo.

Variables de entorno requeridas (en .env):
- DATABASE_URL: URL de conexión a PostgreSQL
- JWT_SECRET_KEY: Clave para firmar tokens JWT
- JWT_ALGORITHM: Algoritmo de firma (default: HS256)
- JWT_EXPIRE_MINUTES: Expiración del token (default: 480 = 8 horas)
- HA_URL: URL de Home Assistant
- HA_TOKEN: Token de acceso de Long-Lived Access Token de HA
- TELEMETRY_INTERVAL_SECONDS: Intervalo de telemetría (default: 60)
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuración de la aplicación.
    
    Los valores por defecto son para desarrollo local.
    En producción, todas las variables deben definirse en .env.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base de datos - formato async para SQLAlchemy
    DATABASE_URL: str = "postgresql+asyncpg://ioticlab:iot1cl4b@smartroom_postgres:5432/ioticlab_db"
    
    # JWT - seguridad
    JWT_SECRET_KEY: str = "dev-secret-change-in-production"  # CAMBIAR EN PRODUCCIÓN
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480  # 8 horas
    
    # Home Assistant
    HA_URL: str = "http://localhost:8123"
    HA_PUBLIC_URL: str = "http://localhost:8123"
    HA_TOKEN: str = ""  # Long-Lived Access Token de HA
    
    # Telemetría
    TELEMETRY_INTERVAL_SECONDS: int = 60



# Instancia global de configuración (singleton)
settings = Settings()


@lru_cache
def get_settings() -> Settings:
    """
    Retorna la instancia de configuración con caché.
    
    Utiliza lru_cache para evitar recrear la instancia
    en cada llamada (útil para dependencias FastAPI).
    """
    return settings
