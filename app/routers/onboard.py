import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import require_api_key
from app.config import settings
from app.database import get_db
from app.models import User, QuizResponse, OSConfig, Briefing
from app.redis_client import get_redis
from app.schemas import QuizAnswers, OnboardResponse

router = APIRouter(dependencies=[Depends(require_api_key)])

QUIZ_SESSION_TTL = 3600  # 1 hour


def _build_briefing(name: str, os_config: dict, goals: list[str], domains: list[str]) -> str:
    """Build a briefing in the archetype's operational tone from the ARCHIE os_config."""
    user = os_config.get("user", {})
    archetype = user.get("archetype", "Unknown")
    descriptor = user.get("archetype_descriptor", "")
    element = user.get("bazi_element", "")
    buckets = os_config.get("buckets", [])

    bucket_lines = "\n".join(
        f"  [{b['id']}] {b['label'].upper()}: {b['archetype_focus']}"
        for b in buckets
    )

    primary_objective = goals[0] if goals else "not specified"
    active_domains = ", ".join(domains) if domains else "not specified"

    return (
        f"**FIELD BRIEF — {name.upper()}**\n\n"
        f"**ARCHETYPE:** {archetype} ({element})\n"
        f"_{descriptor}_\n\n"
        f"**PRIORITY MATRIX:**\n{bucket_lines}\n\n"
        f"**PRIMARY OBJECTIVE:** {primary_objective}\n"
        f"**ACTIVE DOMAINS:** {active_domains}\n\n"
        "Your OS is live. Tududi tasks synced. Execute with precision."
    )


@router.post("/onboard", response_model=OnboardResponse)
async def onboard(
    payload: QuizAnswers,
    db: AsyncSession = Depends(get_db),
) -> OnboardResponse:
    """
    Full onboarding flow:
    1. Upsert user record in PostgreSQL
    2. Store quiz answers (also cache progress in Redis)
    3. Call ARCHIE (os-generator POST /generate) → get os_config
    4. Build briefing text from os_config
    5. Call TUDOR (tududi-bridge POST /sync) → sync tasks
    6. Persist os_config + briefing
    7. Clear Redis session cache
    8. Return briefing + os_config to TELLY
    """
    # 1. Upsert user
    result = await db.execute(
        select(User).where(User.telegram_id == payload.telegram_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = User(telegram_id=payload.telegram_id)
        db.add(user)
        await db.flush()

    # 2. Store quiz answers + cache in Redis
    quiz_data = {
        "name": payload.name,
        "birth_date": payload.birth_date.isoformat(),
        "goals": payload.goals,
        "domains": payload.domains,
        **payload.extras,
    }
    quiz = QuizResponse(user_id=user.id, answers=quiz_data)
    db.add(quiz)

    redis = await get_redis()
    session_key = f"quiz:{payload.telegram_id}"
    await redis.setex(session_key, QUIZ_SESSION_TTL, json.dumps(quiz_data))

    # 3. Call ARCHIE
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            gen_resp = await client.post(
                f"{settings.os_generator_url}/generate",
                json={
                    "name": payload.name,
                    "birth_date": payload.birth_date.isoformat(),
                    "goals": payload.goals,
                    "domains": payload.domains,
                },
            )
            gen_resp.raise_for_status()
            os_config_data = gen_resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OS Generator error: {exc}")

    # 4. Build briefing
    briefing_text = _build_briefing(payload.name, os_config_data, payload.goals, payload.domains)

    # 5. Call TUDOR (non-fatal if unavailable)
    # tududi-bridge expects the raw OSConfig JSON (same shape as os-generator response)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            sync_resp = await client.post(
                f"{settings.tududi_bridge_url}/sync",
                json=os_config_data,
            )
            sync_resp.raise_for_status()
    except httpx.HTTPError:
        # Non-fatal: tududi sync failure doesn't block onboarding
        pass

    # 6. Persist config + briefing
    db.add(OSConfig(user_id=user.id, config=os_config_data))
    db.add(Briefing(user_id=user.id, text=briefing_text))
    await db.commit()

    # 7. Clear Redis session
    await redis.delete(session_key)

    return OnboardResponse(
        user_id=user.id,
        briefing=briefing_text,
        os_config=os_config_data,
    )
