import re
import sys

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
    # If the user pasted a label like "Internal Database URL: postgres://....", extract the URL part.
    m = re.search(r"(postgres(?:ql)?://\S+|sqlite:\S+)", u)
    if m:
        u = m.group(1)
    if u.startswith("postgres://"):
        return "postgresql+psycopg2://" + u[len("postgres://") :]
    return u


_db_url = _normalize_database_url(settings.database_url)
if "://" not in _db_url:
    print(
        f"[DB] Invalid DATABASE_URL (redacted). Got: {settings.database_url!r}",
        file=sys.stderr,
    )
    raise ValueError("Invalid DATABASE_URL: must look like postgresql://... or sqlite:///...")

engine = create_engine(_db_url, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
