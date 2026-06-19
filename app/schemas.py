import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel


# --- Quiz / Onboard ---

class QuizAnswers(BaseModel):
    """Sent by TELLY after user completes the quiz."""
    telegram_id: str
    name: str
    birth_date: date
    goals: list[str] = []
    domains: list[str] = []
    # Extra free-form answers stored in DB but not sent to os-generator
    extras: dict[str, Any] = {}


class OnboardResponse(BaseModel):
    user_id: uuid.UUID
    briefing: str
    os_config: dict[str, Any]


# --- OS Generator (ARCHIE) API ---

class GenerateRequest(BaseModel):
    """Forwarded to ARCHIE."""
    name: str
    birth_date: date
    goals: list[str] = []
    domains: list[str] = []


# OSConfig as returned by ARCHIE
BaZiElement = Literal["Metal", "Wood", "Water", "Fire", "Earth"]


class UserProfile(BaseModel):
    name: str
    bazi_element: BaZiElement
    archetype: str
    archetype_descriptor: str


class Bucket(BaseModel):
    id: str
    label: str
    description: str
    archetype_focus: str
    initial_projects: list[str]


class OSConfig(BaseModel):
    schema_version: str
    user: UserProfile
    buckets: list[Bucket]
    tone: str
    generated_at: datetime


# Proxy endpoint schema
class GenerateResponse(BaseModel):
    os_config: dict[str, Any]
    briefing: str


# --- tududi Sync ---

class SyncRequest(BaseModel):
    user_id: str
    os_config: dict[str, Any]


class SyncResponse(BaseModel):
    synced: bool
    details: dict[str, Any] = {}


# --- Briefing ---

class BriefingResponse(BaseModel):
    user_id: uuid.UUID
    briefing: str


# --- P&L ---

class DailyPnL(BaseModel):
    date: str
    broker: str
    pnl: float
    nav: float
    return_pct: float


class BrokerSummary(BaseModel):
    broker_key: str
    broker_name: str
    account_type: str
    starting_balance: float
    current_nav: float
    total_pnl: float
    total_return_pct: float
    trading_days: int


class PnLResponse(BaseModel):
    total_pnl: float
    daily_breakdown: list[DailyPnL]
    per_broker: dict[str, BrokerSummary]
    win_rate: float
    total_trading_days: int
    days_requested: int
    start_date: str | None = None
    end_date: str | None = None
