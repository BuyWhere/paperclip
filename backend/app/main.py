import json
import logging
import logging.config
import time
from contextlib import asynccontextmanager

import httpx
import jwt as pyjwt
import sentry_sdk
from fastapi import Depends, FastAPI, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from redis.asyncio import Redis
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import Base, engine, get_db_session
from app.dependencies import get_current_user, require_admin
from app.logging_config import LOG_CONFIG
from app.models import User, WaitlistEntry
from app.schemas import (
    AppleExchangeRequest,
    AppleExchangeResponse,
    HealthResponse,
    ReferralCodeResponse,
    ReferralValidateRequest,
    ReferralValidateResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    VerifyRequest,
    WaitlistEntryResponse,
    WaitlistJoinRequest,
    WaitlistJoinResponse,
    WaitlistStatsResponse,
)
from app.services import (
    add_waitlist_entry,
    authenticate_user,
    consume_apple_otc,
    create_apple_otc,
    create_user,
    get_or_create_apple_user,
    get_or_create_referral_code,
    get_user_by_email,
    get_user_by_id,
    get_waitlist_count,
    get_waitlist_entries,
    get_waitlist_without_early_access,
    issue_session,
    mark_early_access_sent,
    record_referral_use,
    validate_referral_code,
)
from app.email import send_early_access_email
from app.routers import telegram as telegram_router
from app.resend_client import add_contact_to_audience, is_audience_push_enabled


settings = get_settings()

# ---------------------------------------------------------------------------
# Rate limiter — Redis-backed, keyed by client IP
# ---------------------------------------------------------------------------
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=["200/minute"],
)


# ---------------------------------------------------------------------------
# Structured JSON logging — stdout → Railway logs
# ---------------------------------------------------------------------------
logging.config.dictConfig(LOG_CONFIG)
logger = logging.getLogger("8os.api")


# ---------------------------------------------------------------------------
# Sentry initialisation
# ---------------------------------------------------------------------------
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
        send_default_pii=False,
    )
    logger.info(json.dumps({"event": "sentry_initialized", "environment": settings.environment}))


# ---------------------------------------------------------------------------
# Telegram alert helper
# ---------------------------------------------------------------------------
async def _send_telegram_alert(message: str) -> None:
    """Fire-and-forget Telegram message. Silently drops on error."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                url,
                json={"chat_id": settings.telegram_chat_id, "text": message, "parse_mode": "HTML"},
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning(json.dumps({"event": "telegram_alert_failed", "error": str(exc)}))


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    app.state.redis = redis

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # OS-1096: additive migration — add archetype column to waitlist_entries
        # if it doesn't already exist (idempotent). Backfills NULL for existing rows.
        await conn.execute(text(
            "ALTER TABLE waitlist_entries "
            "ADD COLUMN IF NOT EXISTS archetype VARCHAR(64) NULL"
        ))

    logger.info(json.dumps({
        "event": "startup",
        "environment": settings.environment,
        "jwt_algorithm": settings.jwt_algorithm,
        "jwt_expiration_minutes": settings.jwt_expiration_minutes,
        "sentry_enabled": bool(settings.sentry_dsn),
        "telegram_alerts_enabled": bool(settings.telegram_bot_token and settings.telegram_chat_id),
    }))

    try:
        yield
    finally:
        logger.info(json.dumps({"event": "shutdown"}))
        await redis.aclose()
        await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    description="8os Archetype API — personalized operating system engine",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# OS-1117: Telegram bot webhook (see app/routers/telegram.py for the
# full spec — secret-token verify, /start /help /status /archetype,
# production onboarding prompt).
app.include_router(telegram_router.router)


# ---------------------------------------------------------------------------
# Performance + alert middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def performance_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000

    logger.info(json.dumps({
        "event": "request",
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "duration_ms": round(elapsed_ms, 2),
    }))

    # 5xx → Telegram alert
    if response.status_code >= 500:
        await _send_telegram_alert(
            f"🚨 <b>5xx Error</b>\n"
            f"<code>{request.method} {request.url.path}</code>\n"
            f"Status: {response.status_code}\n"
            f"Duration: {elapsed_ms:.0f}ms\n"
            f"Env: {settings.environment}"
        )

    # Slow responses → Telegram alert (skip health-check endpoint)
    elif elapsed_ms > settings.slow_response_threshold_ms and request.url.path != "/health":
        await _send_telegram_alert(
            f"⚠️ <b>Slow Response</b>\n"
            f"<code>{request.method} {request.url.path}</code>\n"
            f"Duration: {elapsed_ms:.0f}ms (threshold: {settings.slow_response_threshold_ms}ms)\n"
            f"Status: {response.status_code}\n"
            f"Env: {settings.environment}"
        )

    return response


# ---------------------------------------------------------------------------
# Exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(json.dumps({
        "event": "unhandled_error",
        "path": str(request.url.path),
        "method": request.method,
        "error": type(exc).__name__,
        "detail": str(exc),
    }))
    if settings.sentry_dsn:
        sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    database = "ok"
    redis_status = "ok"

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        database = "error"

    try:
        await app.state.redis.ping()
    except Exception:
        redis_status = "error"

    status_text = "ok" if database == "ok" and redis_status == "ok" else "degraded"
    return HealthResponse(status=status_text, database=database, redis=redis_status)


@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute;20/hour")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    try:
        user = await create_user(db, payload.email, payload.password)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        ) from exc

    if payload.referral_code:
        await record_referral_use(db, payload.referral_code, user)

    return UserResponse(id=str(user.id), email=user.email)


@app.post("/auth/verify", response_model=TokenResponse)
@limiter.limit("10/minute;50/hour")
async def verify(
    request: Request,
    payload: VerifyRequest,
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    user = await authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = await issue_session(app.state.redis, user)
    return TokenResponse(access_token=token)


@app.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(id=str(current_user.id), email=current_user.email)


@app.get("/referral/code", response_model=ReferralCodeResponse)
async def get_referral_code(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ReferralCodeResponse:
    code = await get_or_create_referral_code(db, current_user)
    return ReferralCodeResponse(code=code, uses=0)


@app.post("/referral/validate", response_model=ReferralValidateResponse)
@limiter.limit("20/minute")
async def validate_referral(
    request: Request,
    payload: ReferralValidateRequest,
    db: AsyncSession = Depends(get_db_session),
) -> ReferralValidateResponse:
    valid, referrer_email = await validate_referral_code(db, payload.code)
    return ReferralValidateResponse(valid=valid, referrer_email=referrer_email)


@app.post("/referral/record", response_model=UserResponse)
async def record_referral(
    payload: ReferralValidateRequest,
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    user = await get_user_by_email(db, payload.code)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral code owner not found",
        )
    await record_referral_use(db, payload.code, user)
    return UserResponse(id=str(user.id), email=user.email)


@app.post("/waitlist/join", response_model=WaitlistJoinResponse)
@limiter.limit("3/minute;10/hour")
async def join_waitlist(
    request: Request,
    payload: WaitlistJoinRequest,
    db: AsyncSession = Depends(get_db_session),
) -> WaitlistJoinResponse:
    # OS-1120: services.add_waitlist_entry has a hardcoded _ALLOWED_SOURCES
    # whitelist that silently coerces any unknown source to "dashboard", which
    # breaks channel attribution for marketing (OS-1083, OS-1079). Insert
    # WaitlistEntry directly with a normalized source so Reddit/Product Hunt/
    # podcast/etc. channels are recorded verbatim. The service still owns the
    # archetype normalization; we replicate the small email/source/archetype
    # normalization here intentionally.
    source = (payload.source or "").strip().lower()[:64] or "dashboard"
    archetype = (
        payload.archetype.strip().lower()[:64] or None
        if payload.archetype is not None
        else None
    )
    entry = WaitlistEntry(
        email=payload.email.lower()[:254],
        source=source,
        archetype=archetype,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    position = await get_waitlist_count(db)
    total = position

    # OS-1176: fire-and-forget Resend audience push. Never raises; never
    # blocks the response. Skipped cleanly when RESEND_AUDIENCE_PUSH_ENABLED
    # is false (the default). Lets Mira's outreach flow stay in sync with
    # /coming-soon capture without coupling the waitlist join response to
    # the Resend API.
    if is_audience_push_enabled():
        import asyncio
        asyncio.create_task(add_contact_to_audience(
            email=entry.email,
            archetype=entry.archetype,
            affiliate_opt_in=bool(entry.affiliate_opt_in),
        ))

    return WaitlistJoinResponse(
        success=True,
        message="Successfully joined waitlist",
        position=position,
        total=total,
    )


@app.get("/waitlist/stats", response_model=WaitlistStatsResponse)
async def get_waitlist_stats(
    db: AsyncSession = Depends(get_db_session),
) -> WaitlistStatsResponse:
    count = await get_waitlist_count(db)
    entries = await get_waitlist_entries(db)
    return WaitlistStatsResponse(
        count=count,
        entries=[
            WaitlistEntryResponse(
                id=str(e.id),
                email=e.email,
                source=e.source,
                archetype=e.archetype,
                early_access_sent=e.early_access_sent,
                created_at=e.created_at,
            )
            for e in entries
        ],
    )


@app.post("/waitlist/send-early-access", dependencies=[Depends(require_admin)])
async def send_early_access(
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    entries = await get_waitlist_without_early_access(db)
    sent_count = 0
    failed_count = 0

    for entry in entries:
        success = await send_early_access_email(entry.email, settings.early_access_url)
        if success:
            await mark_early_access_sent(db, entry.id)
            sent_count += 1
        else:
            failed_count += 1

    return {
        "sent": sent_count,
        "failed": failed_count,
        "remaining": len(entries) - sent_count,
    }


# ---------------------------------------------------------------------------
# OS-1176: Resend wire admin routes
# ---------------------------------------------------------------------------
from pydantic import BaseModel as _BaseModel


class WaitlistResyncResponse(_BaseModel):
    """OS-1176 admin resync summary."""
    pushed: int
    skipped: int
    failed: int
    audience_push_enabled: bool


@app.post(
    "/admin/waitlist/resync",
    response_model=WaitlistResyncResponse,
    dependencies=[Depends(require_admin)],
)
async def resync_waitlist_to_resend(
    db: AsyncSession = Depends(get_db_session),
) -> WaitlistResyncResponse:
    """Push every existing waitlist entry to the Resend Audience.

    Used after the Resend wire goes live to backfill the audience with the
    historical signups (27+ as of OS-1173 launch). Always available to
    admin, but the actual push is a no-op when `is_audience_push_enabled`
    is false (so the operator can sanity-check the route before enabling
    the flag).
    """
    entries = await get_waitlist_entries(db)
    pushed = 0
    skipped = 0
    failed = 0
    enabled = is_audience_push_enabled()

    for entry in entries:
        if not enabled:
            skipped += 1
            continue
        ok = await add_contact_to_audience(
            email=entry.email,
            archetype=entry.archetype,
            affiliate_opt_in=bool(entry.affiliate_opt_in),
        )
        if ok:
            pushed += 1
        else:
            failed += 1

    return WaitlistResyncResponse(
        pushed=pushed,
        skipped=skipped,
        failed=failed,
        audience_push_enabled=enabled,
    )


# ---------------------------------------------------------------------------
# Apple Sign-In
# ---------------------------------------------------------------------------
_APPLE_PUBLIC_KEYS_URL = "https://appleid.apple.com/auth/keys"
_APPLE_ISSUER = "https://appleid.apple.com"
# PyJWKClient handles key caching internally.
_apple_jwks_client = pyjwt.PyJWKClient(_APPLE_PUBLIC_KEYS_URL, cache_keys=True)  # type: ignore[attr-defined]


async def _verify_apple_id_token(id_token: str) -> dict:
    """Verify Apple's RS256 identity token and return the decoded claims."""
    if not settings.apple_client_id:
        raise HTTPException(status_code=500, detail="Apple Sign-In not configured")
    try:
        signing_key = _apple_jwks_client.get_signing_key_from_jwt(id_token)
        claims = pyjwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer=_APPLE_ISSUER,
        )
    except pyjwt.exceptions.PyJWTError as exc:
        logger.warning(json.dumps({"event": "apple_token_invalid", "error": str(exc)}))
        raise HTTPException(status_code=400, detail="Invalid Apple identity token") from exc
    return claims


@app.post("/auth/apple/callback")
@limiter.limit("10/minute")
async def apple_callback(
    request: Request,
    id_token: str = Form(...),
    code: str = Form(...),
    state: str | None = Form(default=None),
    user: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
    """
    Apple Sign-In server-side callback.

    Apple POSTs here after the user authenticates.  We verify the id_token,
    get-or-create the user, issue a short-lived one-time code (OTC), and
    redirect the browser to the frontend with *only* that opaque code.

    The JWT session token is never placed in a URL — the frontend must call
    POST /auth/apple/exchange to obtain it.
    """
    claims = await _verify_apple_id_token(id_token)
    apple_sub: str = claims["sub"]
    # `email` is present on first sign-in; subsequent sign-ins may omit it.
    email: str | None = claims.get("email")
    if not email and user:
        try:
            user_info = json.loads(user)
            email = user_info.get("email")
        except (ValueError, TypeError):
            pass
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by Apple")

    db_user = await get_or_create_apple_user(db, apple_sub, email)
    otc = await create_apple_otc(app.state.redis, str(db_user.id))

    logger.info(json.dumps({"event": "apple_signin", "user_id": str(db_user.id)}))
    return RedirectResponse(
        f"{settings.frontend_url}/auth/apple/callback?code={otc}",
        status_code=302,
    )


@app.post("/auth/apple/exchange", response_model=AppleExchangeResponse)
@limiter.limit("10/minute")
async def apple_exchange(
    request: Request,
    payload: AppleExchangeRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AppleExchangeResponse:
    """
    Exchange a short-lived Apple Sign-In one-time code for a session JWT.

    The code is single-use and expires in 60 seconds.  The JWT is returned
    in the response body (never in a URL).
    """
    user_id = await consume_apple_otc(app.state.redis, payload.code)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    db_user = await get_user_by_id(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    token = await issue_session(app.state.redis, db_user)
    return AppleExchangeResponse(access_token=token)


# ---------------------------------------------------------------------------
# Developer API — v1/archetype
# ---------------------------------------------------------------------------
from pydantic import BaseModel as _BaseModel
from typing import Optional as _Optional
from app.archetype_engine import generate_archetype as _generate_archetype, lookup_archetype as _lookup_archetype


class ArchetypeGenerateRequest(_BaseModel):
    birth_date: str
    """Birth date in YYYY-MM-DD format (required)."""
    birth_time: _Optional[str] = None
    """Birth time in HH:MM 24-hour format (optional — improves accuracy)."""
    birth_location: _Optional[str] = None
    """Birth location string (optional — reserved for future use)."""
    personality_code: str = "sg"
    """Personality code: sg (Systematic Goal) | sp (Systematic Process) | ig (Intuitive Goal) | ip (Intuitive Process). Defaults to 'sg'."""


@app.post(
    "/v1/archetype",
    tags=["Archetype API"],
    summary="Generate a personalized archetype from birth data",
    response_description="The generated archetype and its metadata",
)
@limiter.limit("30/minute;200/hour")
async def generate_archetype_endpoint(
    request: Request,
    payload: ArchetypeGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a BaZi-based personal archetype from birth date and optional details.

    Returns the archetype ID, name, description, element, and personality metadata.
    """
    import re

    # Validate birth_date format
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', payload.birth_date):
        raise HTTPException(status_code=422, detail="birth_date must be in YYYY-MM-DD format")

    # Validate birth_time format if provided
    if payload.birth_time and not re.match(r'^\d{2}:\d{2}$', payload.birth_time):
        raise HTTPException(status_code=422, detail="birth_time must be in HH:MM format")

    valid_codes = {"sg", "sp", "ig", "ip"}
    if payload.personality_code not in valid_codes:
        raise HTTPException(
            status_code=422,
            detail=f"personality_code must be one of: {', '.join(sorted(valid_codes))}",
        )

    try:
        result = _generate_archetype(
            birth_date=payload.birth_date,
            birth_time=payload.birth_time,
            personality_code=payload.personality_code,
        )
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "archetype_id":       result.archetype_id,
        "archetype_name":     result.archetype_name,
        "description":        result.description,
        "sun_sign":           result.sun_sign,
        "day_master":         result.day_master,
        "day_master_romanized": result.day_master_romanized,
        "day_element":        result.day_element,
        "strength":           result.strength,
        "personality_code":   result.personality_code,
        "personality_label":  result.personality_label,
    }


@app.get(
    "/v1/archetype/{archetype_id}",
    tags=["Archetype API"],
    summary="Look up a static archetype definition by ID",
    response_description="The archetype definition and metadata",
)
@limiter.limit("60/minute")
async def get_archetype_definition(
    request: Request,
    archetype_id: str,
):
    """
    Look up the static definition for a given archetype ID.

    No authentication required — archetype definitions are public.

    **archetype_id format:** `{sun_sign}_{day_master_romanized}_{strength}_{personality_code}`

    **Example:** `capricorn_geng_strong_sg`
    """
    definition = _lookup_archetype(archetype_id)
    if definition is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown archetype: '{archetype_id}'. Check sun_sign, day_master, strength, and personality_code values.",
        )
    return definition
