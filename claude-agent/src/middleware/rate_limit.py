"""Per-user rate limiting for expensive endpoints.

The /chat endpoint hits the Anthropic API on every request, so an unbounded
client (or compromised token) could burn through the API budget. This module
provides a simple in-memory fixed-window rate limiter keyed by user_id,
mirroring the pattern used by the Go backend's auth rate limiter.

CASA Tier 3 / OWASP ASVS V2.2.1 anti-automation also calls for rate limiting
on endpoints that consume significant resources per request.

Caveat: counters are per-process, so in a multi-instance Cloud Run deployment
the effective limit is N * limit. That is acceptable here as a cost-control
safety net — tightening it further would require Redis, which is overkill
for a single-region deployment.
"""

import threading
import time
from dataclasses import dataclass

import structlog
from fastapi import Depends, HTTPException

from src.config import get_settings
from src.middleware.auth import get_request_context
from src.models.context import RequestContext

logger = structlog.get_logger()


@dataclass
class _Entry:
    count: int
    reset_at: float


class RateLimiter:
    """Fixed-window in-memory rate limiter.

    Allows `limit` requests per `window_seconds` per key. Thread-safe for use
    under FastAPI's sync/async workers.
    """

    def __init__(self, limit: int, window_seconds: int) -> None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self._limit = limit
        self._window = window_seconds
        self._entries: dict[str, _Entry] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Record a request for `key` and raise 429 if over the limit."""
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None or now >= entry.reset_at:
                self._entries[key] = _Entry(count=1, reset_at=now + self._window)
                return

            entry.count += 1
            if entry.count > self._limit:
                retry_after = max(1, int(entry.reset_at - now))
                logger.warning(
                    "rate_limit_exceeded",
                    key=key,
                    limit=self._limit,
                    window_seconds=self._window,
                    retry_after=retry_after,
                )
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

    def reset(self) -> None:
        """Clear all counters. Intended for tests."""
        with self._lock:
            self._entries.clear()


_chat_limiter: RateLimiter | None = None


def get_chat_limiter() -> RateLimiter:
    """Return the singleton chat rate limiter."""
    global _chat_limiter
    if _chat_limiter is None:
        settings = get_settings()
        _chat_limiter = RateLimiter(
            limit=settings.rate_limit_requests_per_minute,
            window_seconds=60,
        )
    return _chat_limiter


async def rate_limited_context(
    ctx: RequestContext = Depends(get_request_context),  # noqa: B008
) -> RequestContext:
    """FastAPI dependency: enforce per-user chat rate limit, then return ctx.

    Chains after `get_request_context` so auth runs first (avoids rate-limiting
    unauthenticated garbage as a valid user). When `disable_rate_limiting` is
    set, the limiter is bypassed entirely (for tests and e2e runs).
    """
    settings = get_settings()
    if not settings.disable_rate_limiting:
        get_chat_limiter().check(ctx.user_id)
    return ctx
