"""
Configuración centralizada de la aplicación.

Carga las variables de entorno desde el archivo .env y proporciona
valores por defecto para el entorno de desarrollo.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de la aplicación."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://ioticlab:iot1cl4b@smartroom_postgres:5432/ioticlab_db"
    JWT_SECRET_KEY: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    HA_URL: str = "http://localhost:8123"
    HA_TOKEN: str = ""
    TELEMETRY_INTERVAL_SECONDS: int = 60


settings = Settings()


@lru_cache
def get_settings() -> Settings:
    """Retorna la instancia de configuración."""
    return settings