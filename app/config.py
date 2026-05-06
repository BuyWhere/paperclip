from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://8os:8ospass@postgres:5432/8os"
    redis_url: str = "redis://redis:6379"
    api_key: str  # No default — must be set via API_KEY env var. Startup fails if missing.
    os_generator_url: str = "http://os-generator:8001"
    tududi_bridge_url: str = "http://tududi-bridge:8001"

    @field_validator("api_key")
    @classmethod
    def api_key_must_be_strong(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("API_KEY must be at least 32 characters")
        return v

    class Config:
        env_file = ".env"


settings = Settings()
