from pathlib import Path
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Find root or backend .env
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILES = [
    _BACKEND_DIR / ".env",
    _BACKEND_DIR.parent / ".env",
]


class Settings(BaseSettings):
    """Application configuration loaded from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Groq API configuration
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq Cloud API Key. Required for live LLM inference.",
    )

    # Multi-model routing to stay within Groq free-tier 8K TPM rate limits
    GROQ_GUARD_MODEL: str = Field(
        default="meta-llama/llama-prompt-guard-2-22m",
        description="Prompt guard model for fast injection check",
    )
    GROQ_DECOMPOSER_MODEL: str = Field(
        default="openai/gpt-oss-20b",
        description="Fast claim decomposition model",
    )
    GROQ_PROPONENT_MODEL: str = Field(
        default="qwen/qwen3.8-27b",
        description="Debater model arguing SUPPORT",
    )
    GROQ_SKEPTIC_MODEL: str = Field(
        default="openai/gpt-oss-20b",
        description="Debater model arguing REFUTE",
    )
    GROQ_JUDGE_MODEL: str = Field(
        default="openai/gpt-oss-120b",
        description="Reasoning model for verdict synthesis and citation audit",
    )

    # Database paths
    CHECKPOINTS_DB_PATH: str = Field(
        default="checkpoints.db",
        description="Path to SQLite LangGraph checkpoint database",
    )
    DEBATES_DB_PATH: str = Field(
        default="debates.db",
        description="Path to SQLite debates history database",
    )

    # Toggles
    ENABLE_PROMPT_GUARD: bool = Field(
        default=True,
        description="Whether to run prompt guard check before decomposition",
    )

    @property
    def server_key_configured(self) -> bool:
        """Return True if a non-placeholder GROQ_API_KEY is configured on the server."""
        key = self.GROQ_API_KEY.strip()
        return bool(key and not key.startswith("your_groq_api_key"))

    def validate_groq_api_key(self) -> str:
        """Validate that GROQ_API_KEY is populated before live LLM invocation.
        
        Raises:
            RuntimeError: If GROQ_API_KEY is missing or contains placeholder.
        """
        key = self.GROQ_API_KEY.strip()
        if not key or key.startswith("your_groq_api_key"):
            raise RuntimeError(
                "GROQ_API_KEY is missing or invalid. Please set a valid Groq API key "
                "in backend/.env (e.g., GROQ_API_KEY=gsk_...) or provide one via API Settings."
            )
        return key

    def get_model_presets(self) -> dict[str, dict[str, str]]:
        """Return model slot mappings for each UI model tier preset."""
        return {
            "balanced": {
                "guard": self.GROQ_GUARD_MODEL,
                "decomposer": self.GROQ_DECOMPOSER_MODEL,
                "proponent": self.GROQ_PROPONENT_MODEL,
                "skeptic": self.GROQ_SKEPTIC_MODEL,
                "judge": self.GROQ_JUDGE_MODEL,
            },
            "fast": {
                "guard": self.GROQ_GUARD_MODEL,
                "decomposer": "llama-3.1-8b-instant",
                "proponent": "llama-3.1-8b-instant",
                "skeptic": "llama-3.1-8b-instant",
                "judge": "llama-3.1-8b-instant",
            },
            "smart": {
                "guard": self.GROQ_GUARD_MODEL,
                "decomposer": "llama-3.3-70b-versatile",
                "proponent": "llama-3.3-70b-versatile",
                "skeptic": "llama-3.3-70b-versatile",
                "judge": "llama-3.3-70b-versatile",
            },
        }


settings = Settings()


def resolve_api_key(request_key: Optional[str] = None) -> str:
    """Resolve the active Groq API key: per-request BYOAK key wins, else server .env key."""
    if request_key and request_key.strip() and not request_key.strip().startswith("your_groq_api_key"):
        return request_key.strip()
    return settings.validate_groq_api_key()
