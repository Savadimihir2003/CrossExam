from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import config_router, router as debates_router
from app.config import settings
from app.db.sqlite import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("crossexam")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context: initialize databases upon startup."""
    logger.info("Initializing SQLite persistence at %s...", settings.DEBATES_DB_PATH)
    await init_db(settings.DEBATES_DB_PATH)
    logger.info("Database initialized successfully.")
    yield
    logger.info("Application shutdown.")


app = FastAPI(
    title="CrossExam API",
    description="Adversarial Fact-Checker & Multi-Agent Debate Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount debates and config APIs
app.include_router(debates_router)
app.include_router(config_router)


@app.get("/health")
async def health_check():
    """Service health and model routing configuration."""
    return {
        "status": "healthy",
        "service": "CrossExam Engine",
        "models": {
            "guard": settings.GROQ_GUARD_MODEL,
            "decomposer": settings.GROQ_DECOMPOSER_MODEL,
            "proponent": settings.GROQ_PROPONENT_MODEL,
            "skeptic": settings.GROQ_SKEPTIC_MODEL,
            "judge": settings.GROQ_JUDGE_MODEL,
        },
        "databases": {
            "checkpoints": settings.CHECKPOINTS_DB_PATH,
            "debates": settings.DEBATES_DB_PATH,
        },
    }
