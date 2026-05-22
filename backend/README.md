# 8OS Orchestrator Backend

Minimal FastAPI auth/orchestrator skeleton for `OS-76`.

## Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/verify`
- `GET /me`

## Local run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

The service expects PostgreSQL and Redis connection strings via `.env` or `ORCHESTRATOR_*` environment variables.

## Railway variables

The backend now accepts both Railway-style and app-specific env names:

- `PORT` or `ORCHESTRATOR_PORT`
- `DATABASE_URL` or `ORCHESTRATOR_DATABASE_URL`
- `REDIS_URL` or `ORCHESTRATOR_REDIS_URL`
- `JWT_SECRET` or `ORCHESTRATOR_JWT_SECRET`

Optional metadata variables:

- `RAILWAY_PROJECT_ID`
- `RAILWAY_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Known remaining requirement for live deployment:

- A valid PostgreSQL `DATABASE_URL`
- A valid Redis `REDIS_URL`
