"""P&L aggregation endpoint — returns profit/loss data from configured brokers."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_api_key
from app.schemas import PnLResponse
from app.services import pnl as pnl_service

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/pnl", response_model=PnLResponse)
async def get_pnl(
    days: int = Query(30, ge=1, le=365, description="Look-back period in calendar days"),
    broker: str | None = Query(None, description="Optional broker key filter (e.g. 'alpaca')"),
):
    """
    Aggregate P&L across all configured brokers.

    Returns total P&L, daily breakdown, per-broker summaries, and win rate
    for the requested look-back period.

    **Query parameters:**
    - `days` (int, default 30, max 365) — look-back calendar days
    - `broker` (str, optional) — filter to a single broker key

    **Auth:** Requires `X-API-Key` header matching the orchestrator `API_KEY`.
    """
    if broker is not None and broker not in pnl_service.get_available_brokers():
        raise HTTPException(
            status_code=404,
            detail=f"Unknown broker '{broker}'. Available: {', '.join(pnl_service.get_available_brokers())}",
        )

    result = pnl_service.fetch_pnl_data(days=days, broker_filter=broker)
    return result
