from pathlib import Path
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
        default=False,
        description="Whether to run prompt guard check before decomposition",
    )

    def validate_groq_api_key(self) -> str:
        """Validate that GROQ_API_KEY is populated before live LLM invocation.
        
        Raises:
            RuntimeError: If GROQ_API_KEY is missing or contains placeholder.
        """
        key = self.GROQ_API_KEY.strip()
        if not key or key.startswith("your_groq_api_key"):
            raise RuntimeError(
                "GROQ_API_KEY is missing or invalid. Please set a valid Groq API key "
                "in backend/.env (e.g., GROQ_API_KEY=gsk_...) or as an environment variable."
            )
        return key


settings = Settings()
