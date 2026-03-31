# Asklytics

**Asklytics** is an AI-assisted financial analytics application: upload spreadsheets or use server-side ingestion (PDF / images in progress), then explore data through a React dashboard with chat-style questions, charts, and analytics.

Repository: [github.com/yuvraj20gole/Asklytics](https://github.com/yuvraj20gole/Asklytics)

---

## What’s in this repo

| Part | Description |
|------|-------------|
| **`backend/`** | FastAPI API: JWT auth, text-to-SQL (`/ask`), PDF financial ingest, PyTorch revenue forecast, image ingest endpoint (pipeline evolving). |
| **`web/`** | Primary UI: Vite + React + TypeScript — landing, auth, dashboard, chat, analytics, settings. |
| **`frontend/`** | Optional **Streamlit** UI that talks to the same API (older flow; see Streamlit section below). |
| **`shared/prompts/`** | Prompt templates for LLM-assisted SQL. |
| **`infra/`** | Docker / compose for packaging experiments. |

---

## Tech stack

- **Backend:** Python, FastAPI, Uvicorn, SQLAlchemy, Pydantic, OpenAI (optional), PyTorch (forecast), PDF/table libraries, OpenCV + EasyOCR (image pipeline).
- **Web:** React 18, TypeScript, Vite, Tailwind, Recharts, React Router.
- **Database:** SQLite by default (`local.db`); PostgreSQL supported via `DATABASE_URL`.

---

## Prerequisites

- **Python** 3.11+ (3.12 recommended; use a **native arm64** interpreter on Apple Silicon).
- **Node.js** 18+ and npm (for `web/`).

---

## Quick start

### 1. Clone and environment

```bash
git clone https://github.com/yuvraj20gole/Asklytics.git
cd Asklytics
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 2. Configure secrets

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `JWT_SECRET_KEY` — use a long random string in any real deployment.
- `OPENAI_API_KEY` — required for LLM text-to-SQL and optional AI helpers (omit to use limited rule-based SQL fallbacks where implemented).

Copy `web/.env.example` to `web/.env` if you need a non-default API URL:

```bash
cp web/.env.example web/.env
# Default API: http://localhost:8000
```

### 3. Run the API

From the **repo root**:

```bash
source .venv/bin/activate
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

Open interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. Run the web app

```bash
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually [http://localhost:5173](http://localhost:5173)).

### 5. (Optional) Streamlit frontend

```bash
source .venv/bin/activate
streamlit run frontend/app.py
```

Set `BACKEND_URL` in the environment if the API is not at `http://localhost:8000`.

---

## Demo account

After the API starts once, a seeded user may exist (see `backend/app/db/seed.py`):

- Email: `admin@example.com` **or** username: `admin`
- Password: `admin123`

Change this in production.

---

## API overview (prefix `/api/v1`)

| Area | Notes |
|------|--------|
| **Auth** | `POST /auth/register`, `POST /auth/login` → JWT. |
| **Ask** | `POST /ask` — natural language → validated SQL → rows + explanation (requires auth). |
| **PDF ingest** | `POST /ingest/pdf` — multipart form: `company`, `file` (PDF). |
| **Image ingest** | `POST /ingest/image` — multipart form: `company`, image (`.jpg`/`.jpeg`/`.png`); full extraction pipeline under active development. |
| **Forecast** | `GET /ml/revenue-forecast` — PyTorch MLP on ingested revenue facts (requires prior PDF ingest data). |

---

## Troubleshooting

- **Database errors after schema changes:** stop the API, delete `local.db`, restart (dev only — destroys local data).
- **CORS:** the API allows Vite dev origins on `localhost` ports `517x` (see `backend/app/main.py`).
- **Secrets:** never commit `.env`; it is listed in `.gitignore`.

---

## Development notes

- **`debug_output/`** is ignored by Git — use it locally for OCR/PDF debug artifacts.
- **EasyOCR** downloads model weights on first use (~tens of MB).

---

## License

No license file is included yet; add one (e.g. MIT) if you plan to distribute the project.
