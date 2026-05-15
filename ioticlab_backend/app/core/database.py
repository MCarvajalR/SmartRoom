"""
Configuración de la base de datos PostgreSQL.

Proporciona el motor asíncrono, el session maker y la base declarativa
para los modelos SQLAlchemy.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base declarativa para los modelos SQLAlchemy."""
    pass


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Generador de sesiones asíncronas para FastAPI."""
    async with AsyncSessionLocal() as session:
        yield session