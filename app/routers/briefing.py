import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import require_api_key
from app.database import get_db
from app.models import User, Briefing
from app.schemas import BriefingResponse

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/briefing/{user_id}", response_model=BriefingResponse)
async def get_briefing(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> BriefingResponse:
    """Return the latest stored briefing for a user."""
    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Get latest briefing
    brief_result = await db.execute(
        select(Briefing)
        .where(Briefing.user_id == user_id)
        .order_by(Briefing.created_at.desc())
        .limit(1)
    )
    briefing = brief_result.scalar_one_or_none()
    if briefing is None:
        raise HTTPException(status_code=404, detail="No briefing found for user")

    return BriefingResponse(user_id=user.id, briefing=briefing.text)


@router.get("/briefing/by-telegram/{telegram_id}", response_model=BriefingResponse)
async def get_briefing_by_telegram(
    telegram_id: str,
    db: AsyncSession = Depends(get_db),
) -> BriefingResponse:
    """Return the latest stored briefing looked up by Telegram user ID."""
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    brief_result = await db.execute(
        select(Briefing)
        .where(Briefing.user_id == user.id)
        .order_by(Briefing.created_at.desc())
        .limit(1)
    )
    briefing = brief_result.scalar_one_or_none()
    if briefing is None:
        raise HTTPException(status_code=404, detail="No briefing found for user")

    return BriefingResponse(user_id=user.id, briefing=briefing.text)
