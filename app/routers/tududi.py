from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.config import settings
from app.schemas import OSConfig

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.post("/tududi/sync")
async def tududi_sync(os_config: OSConfig) -> dict[str, Any]:
    """
    Proxy POST /sync to TUDOR (tududi-bridge).
    Accepts a full OSConfig object (same shape as os-generator returns).
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.tududi_bridge_url}/sync",
                json=os_config.model_dump(mode="json"),
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"tududi Bridge error: {exc}")
