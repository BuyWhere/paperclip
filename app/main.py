from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import engine
from app.models import Base
from app.redis_client import close_redis
from app.routers import health, onboard, os_config, pnl, tududi, briefing


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (idempotent; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await close_redis()


app = FastAPI(title="8OS Orchestrator", version="0.1.0", lifespan=lifespan)

app.include_router(health.router)
app.include_router(onboard.router)
app.include_router(os_config.router)
app.include_router(tududi.router)
app.include_router(briefing.router)
app.include_router(pnl.router)
