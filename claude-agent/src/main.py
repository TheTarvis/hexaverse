"""FastAPI application entrypoint."""

import json
import logging
from contextlib import asynccontextmanager

import anthropic
import structlog
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from src.agent import Agent
from src.clients.backend_api import BackendApiClient
from src.config import get_settings
from src.middleware.auth import init_firebase
from src.middleware.rate_limit import rate_limited_context
from src.models.api import ChatRequest, HealthResponse
from src.models.context import RequestContext


def configure_logging() -> None:
    """Configure structlog: JSON in production, console-pretty in dev."""
    settings = get_settings()

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer()
            if settings.environment == "production"
            else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


# Module-level singletons, populated in `lifespan`.
_api_client: BackendApiClient | None = None
_anthropic_client: anthropic.AsyncAnthropic | None = None


def get_api_client() -> BackendApiClient:
    if _api_client is None:
        raise RuntimeError("API client not initialized")
    return _api_client


def get_anthropic_client() -> anthropic.AsyncAnthropic:
    if _anthropic_client is None:
        raise RuntimeError("Anthropic client not initialized")
    return _anthropic_client


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Initialize and tear down clients alongside the app lifecycle."""
    global _api_client, _anthropic_client

    logger = structlog.get_logger()
    settings = get_settings()

    logger.info("starting", version="0.1.0", environment=settings.environment)

    # Firebase init is optional locally — without a project ID, every
    # /chat request will 401, but /health stays up so you can confirm the
    # process boots.
    if settings.firebase_project_id:
        init_firebase()
    else:
        logger.warning("firebase_not_configured", hint="Set FIREBASE_PROJECT_ID")

    _api_client = BackendApiClient()
    logger.info("api_client_initialized")

    _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    logger.info("anthropic_client_initialized")

    yield

    if _anthropic_client:
        await _anthropic_client.close()
    if _api_client:
        await _api_client.close()
    logger.info("shutting_down")


configure_logging()

settings = get_settings()

app = FastAPI(
    title="Hexaverse Claude Agent",
    description="Conversational agent using Claude with tool calling.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health endpoints (unauthenticated)
# =============================================================================


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """Health check for Cloud Run."""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        environment=settings.environment,
    )


@app.get("/", tags=["Health"])
async def root() -> dict:
    return {"service": "claude-agent", "status": "ok"}


# =============================================================================
# Chat endpoint
# =============================================================================

logger = structlog.get_logger()


async def _generate_sse_events(agent: Agent, request: ChatRequest):
    """Format the agent's event stream as SSE frames."""
    try:
        async for event in agent.chat(request):
            event_type = event.get("event", "message")
            event_data = event.get("data", {})
            yield f"event: {event_type}\n"
            yield f"data: {json.dumps(event_data)}\n\n"
    except Exception as e:
        logger.error("sse_stream_error", error=str(e))
        yield "event: error\n"
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@app.post("/chat", tags=["Chat"])
async def chat(
    request: ChatRequest,
    ctx: RequestContext = Depends(rate_limited_context),  # noqa: B008
) -> StreamingResponse:
    """Streaming chat endpoint.

    Emits SSE events:
    - `message` — text deltas, tool_use markers, tool_result markers
    - `done` — turn complete
    - `error` — something went wrong upstream
    """
    logger.info(
        "chat_request",
        user_id=ctx.user_id,
        conversation_id=request.conversation_id,
    )

    agent = Agent(
        ctx=ctx,
        api_client=get_api_client(),
        client=get_anthropic_client(),
    )

    return StreamingResponse(
        _generate_sse_events(agent, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering of the stream.
        },
    )


# =============================================================================
# Local dev runner
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.environment == "development",
    )
