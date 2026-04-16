import importlib
from pathlib import Path
import sys
from uuid import uuid4

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture()
def test_database_url(tmp_path: Path) -> str:
    # Use a file DB (not :memory:) because the app creates multiple connections.
    return f"sqlite:///{(tmp_path / 'test.db').as_posix()}"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, test_database_url: str):
    """
    FastAPI TestClient with isolated SQLite DB.

    Note: the app modules create the SQLAlchemy engine at import-time from env,
    so we must set env vars and reload the relevant modules.
    """
    monkeypatch.setenv("DATABASE_URL", test_database_url)
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")

    # Clear settings cache and reload engine/app modules.
    import app.core.config as config

    config.get_settings.cache_clear()

    import app.db.session as session

    importlib.reload(session)

    import app.main as main

    importlib.reload(main)

    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def unique_user_payload() -> dict[str, str]:
    u = uuid4().hex[:10]
    return {
        "company_email": f"user-{u}@example.com",
        "username": f"user_{u}",
        "password": "StrongPassw0rd!",
        "full_name": "Test User",
    }

