import secrets
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ReferralCode, User, WaitlistEntry
from app.security import create_access_token, hash_password, verify_password


SESSION_PREFIX = "session"
APPLE_OTC_PREFIX = "apple_otc"
APPLE_OTC_TTL_SECONDS = 60


async def create_user(session: AsyncSession, email: str, password: str) -> User:
    user = User(email=email.lower(), password_hash=hash_password(password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: str) -> User | None:
    import uuid as _uuid
    try:
        _uuid.UUID(user_id)  # validate format
    except ValueError:
        return None
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def issue_session(redis: Redis, user: User) -> str:
    token, session_id, expires_at = create_access_token(str(user.id))
    ttl_seconds = max(int((expires_at - datetime.now(UTC)).total_seconds()), 1)
    await redis.setex(f"{SESSION_PREFIX}:{session_id}", ttl_seconds, str(user.id))
    return token


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(session, email)
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        return None
    return user


async def get_or_create_apple_user(session: AsyncSession, apple_sub: str, email: str) -> User:
    """Return the existing user for this Apple subject, or create one."""
    result = await session.execute(select(User).where(User.apple_sub == apple_sub))
    user = result.scalar_one_or_none()
    if user:
        return user
    # Fall back to matching by email (user may have registered via password first)
    user = await get_user_by_email(session, email)
    if user:
        user.apple_sub = apple_sub
        await session.commit()
        await session.refresh(user)
        return user
    user = User(email=email.lower(), apple_sub=apple_sub, password_hash=None)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def create_apple_otc(redis: Redis, user_id: str) -> str:
    """Issue a short-lived, single-use opaque code that can be exchanged for a session JWT."""
    code = secrets.token_urlsafe(32)
    await redis.setex(f"{APPLE_OTC_PREFIX}:{code}", APPLE_OTC_TTL_SECONDS, user_id)
    return code


async def consume_apple_otc(redis: Redis, code: str) -> str | None:
    """Atomically consume the one-time code and return the user_id, or None if invalid/expired."""
    key = f"{APPLE_OTC_PREFIX}:{code}"
    user_id = await redis.getdel(key)
    return user_id


# ---------------------------------------------------------------------------
# Waitlist services
# ---------------------------------------------------------------------------

_ALLOWED_SOURCES = {"dashboard", "telegram", "api"}


async def add_waitlist_entry(
    session: AsyncSession, email: str, source: str
) -> tuple["WaitlistEntry", int]:
    source = source if source in _ALLOWED_SOURCES else "dashboard"
    entry = WaitlistEntry(email=email.lower()[:254], source=source)
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
    position = count_result.scalar_one()
    return entry, position


async def get_waitlist_count(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(WaitlistEntry))
    return result.scalar_one()


async def get_waitlist_entries(session: AsyncSession) -> list["WaitlistEntry"]:
    result = await session.execute(select(WaitlistEntry).order_by(WaitlistEntry.created_at))
    return list(result.scalars().all())


async def get_waitlist_without_early_access(session: AsyncSession) -> list["WaitlistEntry"]:
    result = await session.execute(
        select(WaitlistEntry)
        .where(WaitlistEntry.early_access_sent.is_(False))
        .order_by(WaitlistEntry.created_at)
    )
    return list(result.scalars().all())


async def mark_early_access_sent(session: AsyncSession, entry_id: "uuid.UUID") -> None:
    import uuid
    entry = await session.get(WaitlistEntry, entry_id)
    if entry:
        entry.early_access_sent = True
        await session.commit()


# ---------------------------------------------------------------------------
# Referral services
# ---------------------------------------------------------------------------

async def get_or_create_referral_code(session: AsyncSession, user: User) -> str:
    result = await session.execute(
        select(ReferralCode).where(ReferralCode.user_id == user.id)
    )
    referral = result.scalar_one_or_none()
    if referral:
        return referral.code
    code = secrets.token_urlsafe(16)[:24]
    referral = ReferralCode(code=code, user_id=user.id)
    session.add(referral)
    await session.commit()
    await session.refresh(referral)
    return referral.code


async def validate_referral_code(
    session: AsyncSession, code: str
) -> tuple[bool, str | None]:
    result = await session.execute(
        select(ReferralCode, User)
        .join(User, ReferralCode.user_id == User.id)
        .where(ReferralCode.code == code)
    )
    row = result.first()
    if not row:
        return False, None
    _, referrer = row
    return True, referrer.email


async def record_referral_use(session: AsyncSession, code: str, user: User) -> None:
    result = await session.execute(
        select(ReferralCode).where(ReferralCode.code == code)
    )
    referral = result.scalar_one_or_none()
    if referral:
        referral.uses += 1
        await session.commit()
