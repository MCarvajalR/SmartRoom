from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://ioticlab:iot1cl4b@smartroom_postgres:5432/ioticlab_db"

    # JWT
    JWT_SECRET_KEY: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # Home Assistant
    HA_URL: str = "http://localhost:8123"
    HA_TOKEN: str = ""

    # Telemetría
    TELEMETRY_INTERVAL_SECONDS: int = 60


settings = Settings()

# app/core/config.py  — agrega estas líneas al final
from functools import lru_cache

@lru_cache
def get_settings():
    return settings   # retorna la instancia que ya tienes