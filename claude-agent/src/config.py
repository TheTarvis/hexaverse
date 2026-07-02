"""Application configuration via environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server
    port: int = 8080
    environment: str = "development"
    log_level: str = "INFO"

    # CORS — comma-separated list of allowed frontend origins
    cors_allowed_origins: str = "http://localhost:3000"

    # Anthropic
    anthropic_api_key: str = ""

    # Firebase
    firebase_project_id: str = ""
    firebase_auth_emulator_host: str | None = None  # e.g. "localhost:9099" for local dev

    # Backend (Go service) — used by tools that call the backend with the user's token
    backend_api_url: str = "http://localhost:9000"

    # Rate Limiting (per-user sliding window on /chat)
    rate_limit_requests_per_minute: int = 20
    disable_rate_limiting: bool = False  # Set true for tests / e2e runs

    # Agent Settings
    agent_max_tokens: int = 4096
    agent_default_model: str = "claude-sonnet-4-6"
    agent_ack_model: str = "claude-haiku-4-5-20251001"  # Fast model for the streaming ack

    # GCP (for Cloud Logging)
    gcp_project_id: str = ""
    gcp_region: str = "us-central1"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ALLOWED_ORIGINS into a list."""
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
