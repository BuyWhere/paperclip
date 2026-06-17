from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# bcrypt silently truncates passwords at 72 bytes; cap at 128 chars to prevent
# both the truncation-equality bug and CPU exhaustion from very long inputs.
Password = Annotated[str, Field(min_length=8, max_length=128)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password
    referral_code: str | None = None


class VerifyRequest(BaseModel):
    email: EmailStr
    password: Password


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class HealthResponse(BaseModel):
    status: str
    database: str
    redis: str


class AppleExchangeRequest(BaseModel):
    code: str = Field(min_length=16, max_length=128)


class AppleExchangeResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Waitlist schemas
# ---------------------------------------------------------------------------

class WaitlistJoinRequest(BaseModel):
    email: EmailStr
    source: str = "dashboard"
    archetype: str | None = None


class WaitlistJoinResponse(BaseModel):
    success: bool
    message: str
    position: int
    total: int


class WaitlistEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    source: str
    archetype: str | None = None
    early_access_sent: bool
    created_at: datetime


class WaitlistStatsResponse(BaseModel):
    count: int
    entries: list[WaitlistEntryResponse]


class WaitlistDeleteResponse(BaseModel):
    """Return value for DELETE /waitlist/entry/{id} (OS-1237 / OS-1092).

    Matches the original 7256eb7 implementation that was live at 41dda16c
    before the OS-1176 wire-code deploy dropped it. The web-dashboard
    proxy ignores the body on success and just relays the entry id from
    the URL, so this shape is informational for admin tooling.
    """
    deleted: bool
    id: str


# ---------------------------------------------------------------------------
# Referral schemas
# ---------------------------------------------------------------------------

class ReferralCodeResponse(BaseModel):
    code: str
    uses: int


class ReferralValidateRequest(BaseModel):
    code: str


class ReferralValidateResponse(BaseModel):
    valid: bool
    referrer_email: str | None = None
