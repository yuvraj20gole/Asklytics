from fastapi import APIRouter

from app.api.v1.endpoints import ask, auth, health, ingest, ml_forecast

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(ask.router, tags=["ask"])
api_router.include_router(ingest.router, tags=["ingest"])
api_router.include_router(ml_forecast.router, tags=["ml"])
