# AI Data Analyst (Text-to-SQL)

Production-style starter project with FastAPI backend, Streamlit frontend, SQLAlchemy data layer, and LLM-powered text-to-SQL.

## Quick start

1. Create env and install deps:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r backend/requirements.txt`
2. Copy env:
   - `cp .env.example .env`
3. Start backend:
   - `PYTHONPATH=backend uvicorn app.main:app --reload --port 8000`
4. Start frontend:
   - `streamlit run frontend/app.py`

5. In the browser: **Welcome** → **Register** (company email, username, password) or **Login** (email or username + password) → **Home** (ask questions).

**Demo account** (seeded on first run): email `admin@example.com` or username `admin`, password `admin123`.

If you upgraded from an older DB and see errors, delete `local.db` and restart the backend so tables re-create.

## Features included

- Text-to-SQL endpoint at `/api/v1/ask`
- User registration (`/api/v1/auth/register`) and JWT login (`/api/v1/auth/login`)
- Schema-aware prompt context (RAG-style metadata retrieval)
- SQL safety guardrails (SELECT-only + keyword blocking)
- SQL execution with row limit
- Query explanation field in response
- Streamlit flow: Welcome → Register / Login → Home (dashboard with Plotly)
