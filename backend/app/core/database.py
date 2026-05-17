"""
Configuración de la base de datos PostgreSQL.

Proporciona el motor asíncrono, el session maker y la base declarativa
para los modelos SQLAlchemy.

Este módulo establece la conexión con PostgreSQL usando:
- SQLAlchemy async (create_async_engine) para operaciones no bloqueantes
- async_sessionmaker para crear sesiones de base de datos
- DeclarativeBase como clase base para los modelos ORM
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Motor de base de datos asíncrono
# echo=False para no mostrar SQL en logs (cambiar a True para debug)
engine = create_async_engine(settings.DATABASE_URL, echo=False)

# Session maker asíncrono
# expire_on_commit=False para mantener objetos accesibles después del commit
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """
    Base declarativa para los modelos SQLAlchemy.
    
    Todos los modelos (User, Device, TelemetryRecord, etc.) heredan
    de esta clase para obtener la configuración de mapeo ORM.
    """
    pass