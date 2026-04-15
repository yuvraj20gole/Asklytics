from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

def _normalize_database_url(url: str) -> str:
    """
    Render/Postgres providers sometimes emit `postgres://...` URLs.
    SQLAlchemy expects `postgresql://...` (or `postgresql+psycopg2://...`).
    """
    u = (url or "").strip().strip('"').strip("'")
    if u.startswith("postgres://"):
        return "postgresql+psycopg2://" + u[len("postgres://") :]
    return u


engine = create_engine(_normalize_database_url(settings.database_url), future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
