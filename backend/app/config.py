from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "8OS Orchestrator"
    environment: str = "development"
    host: str = "0.0.0.0"
    port: int = Field(default=8000, validation_alias=AliasChoices("PORT", "ORCHESTRATOR_PORT"))
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/8os",
        validation_alias=AliasChoices("DATABASE_URL", "ORCHESTRATOR_DATABASE_URL"),
    )

    @field_validator("database_url", mode="after")
    @classmethod
    def ensure_asyncpg_scheme(cls, v: str) -> str:
        # Railway injects postgresql:// — asyncpg requires postgresql+asyncpg://
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        validation_alias=AliasChoices("REDIS_URL", "ORCHESTRATOR_REDIS_URL"),
    )
    jwt_secret: str = Field(
        default="change-me-in-production",
        validation_alias=AliasChoices("JWT_SECRET", "ORCHESTRATOR_JWT_SECRET"),
    )
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 60

    @field_validator("jwt_secret", mode="after")
    @classmethod
    def reject_default_secret_in_production(cls, v: str, info: object) -> str:
        import os
        env = os.environ.get("ORCHESTRATOR_ENVIRONMENT", os.environ.get("ENVIRONMENT", "development"))
        if env != "development" and v == "change-me-in-production":
            raise ValueError(
                "JWT_SECRET must be overridden in non-development environments. "
                "Generate one with: openssl rand -hex 32"
            )
        return v
    railway_project_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("RAILWAY_PROJECT_ID", "Railway_Project_ID"),
    )
    railway_api_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("RAILWAY_API_TOKEN", "Railway_API_Token"),
    )
    cloudflare_account_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CLOUDFLARE_ACCOUNT_ID", "Cloudflare_Account_ID"),
    )
    cloudflare_api_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CLOUDFLARE_API_TOKEN", "Cloudflare_API_Token"),
    )
    smtp_host: str | None = Field(
        default=None,
        validation_alias="SMTP_HOST",
    )
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str | None = Field(
        default=None,
        validation_alias="SMTP_USER",
    )
    smtp_password: str | None = Field(
        default=None,
        validation_alias="SMTP_PASSWORD",
    )
    smtp_from: str = Field(default="noreply@8os.com", validation_alias="SMTP_FROM")
    early_access_url: str = Field(default="http://localhost:3000/onboarding", validation_alias="EARLY_ACCESS_URL")

    # OS-1176: Resend wire. All env vars are optional — when RESEND_API_KEY is
    # unset, the audience push + email send paths fail soft (no-op + log).
    # Setting RESEND_API_KEY alone does NOT enable audience push: the
    # separate RESEND_AUDIENCE_PUSH_ENABLED flag must be flipped to "true" by
    # the operator (separates deploy from rollout).
    resend_api_key: str | None = Field(default=None, validation_alias="RESEND_API_KEY")
    resend_audience_id: str | None = Field(default=None, validation_alias="RESEND_AUDIENCE_ID")
    resend_from_email: str = Field(default="noreply@8os.ai", validation_alias="RESEND_FROM_EMAIL")
    resend_from_name: str = Field(default="8OS", validation_alias="RESEND_FROM_NAME")
    resend_audience_push_enabled: bool = Field(
        default=False,
        validation_alias="RESEND_AUDIENCE_PUSH_ENABLED",
    )

    # Admin
    admin_api_key: str | None = Field(default=None, validation_alias=AliasChoices("ADMIN_API_KEY"))

    # Observability
    sentry_dsn: str | None = Field(default=None, validation_alias=AliasChoices("SENTRY_DSN"))
    sentry_traces_sample_rate: float = Field(default=0.1, validation_alias=AliasChoices("SENTRY_TRACES_SAMPLE_RATE"))
    telegram_bot_token: str | None = Field(default=None, validation_alias=AliasChoices("TELEGRAM_BOT_TOKEN"))
    telegram_chat_id: str | None = Field(default=None, validation_alias=AliasChoices("TELEGRAM_CHAT_ID"))
    # OS-1117: shared secret for inbound bot updates. Set on Railway after
    # merge via `openssl rand -hex 32`. Telegram sends it in the
    # `X-Telegram-Bot-Api-Secret-Token` header on every webhook delivery.
    telegram_webhook_secret: str | None = Field(
        default=None, validation_alias=AliasChoices("TELEGRAM_WEBHOOK_SECRET")
    )
    # Alert thresholds
    slow_response_threshold_ms: int = Field(default=500, validation_alias=AliasChoices("SLOW_RESPONSE_THRESHOLD_MS"))

    # Apple Sign-In
    apple_client_id: str | None = Field(default=None, validation_alias="APPLE_CLIENT_ID")
    apple_team_id: str | None = Field(default=None, validation_alias="APPLE_TEAM_ID")
    apple_key_id: str | None = Field(default=None, validation_alias="APPLE_KEY_ID")
    # PEM-encoded private key (newlines encoded as \n in env)
    apple_private_key: str | None = Field(default=None, validation_alias="APPLE_PRIVATE_KEY")

    # Frontend base URL — used for post-auth redirects
    frontend_url: str = Field(default="http://localhost:3000", validation_alias="FRONTEND_URL")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
