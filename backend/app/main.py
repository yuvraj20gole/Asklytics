"""API entrypoint. Set OpenMP env before any library (e.g. PyTorch) may load in worker processes."""
import logging
import os

# PyTorch uses Intel OpenMP (libiomp5). On Apple Silicon, using x86_64 Python under Rosetta
# can trigger abort() in MemoryPool::destroy on shutdown. These reduce threading conflicts;
# prefer native arm64 Python (/opt/homebrew) + arm64 torch wheels.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.migrations import migrate_financial_facts_schema, migrate_financial_tables_schema
from app.db.models import Customer, FinancialTable, Order, OrderItem, Product, User  # noqa: F401
from app.db.seed import seed_data
from app.db.session import SessionLocal, engine

configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()
app = FastAPI(title=settings.app_name)


def _parse_cors_origins(raw: str) -> list[str]:
    """Strip whitespace and trailing slashes — browsers send Origin without a trailing slash."""
    out: list[str] = []
    for part in raw.split(","):
        o = part.strip().rstrip("/")
        if o:
            out.append(o)
    return out


_cors_origins = _parse_cors_origins(settings.cors_allow_origins)
if _cors_origins:
    logger.info("[CORS] allow_origins (%d): %s", len(_cors_origins), _cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    logger.warning(
        "[CORS] CORS_ALLOW_ORIGINS empty — only Vite localhost ports allowed; "
        "set CORS_ALLOW_ORIGINS on the host (e.g. https://yuvraj20gole.github.io)"
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):517\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_financial_facts_schema(engine)
    migrate_financial_tables_schema(engine)
    with SessionLocal() as db:
        seed_data(db)
