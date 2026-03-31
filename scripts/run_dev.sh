#!/usr/bin/env bash
set -e
source .venv/bin/activate
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
