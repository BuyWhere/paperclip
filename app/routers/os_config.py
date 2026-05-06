import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.config import settings
from app.schemas import GenerateRequest

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.post("/os-config/generate")
async def generate_os_config(payload: GenerateRequest) -> dict:
    """Proxy POST /generate to ARCHIE (os-generator). Returns raw os_config."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.os_generator_url}/generate",
                json={
                    "name": payload.name,
                    "birth_date": payload.birth_date.isoformat(),
                    "goals": payload.goals,
                    "domains": payload.domains,
                },
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OS Generator error: {exc}")
