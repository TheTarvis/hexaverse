"""Tests for the in-memory rate limiter used on /chat."""

import time

import pytest
from fastapi import HTTPException

from src.middleware.rate_limit import RateLimiter


class TestRateLimiter:
    def test_allows_requests_under_limit(self) -> None:
        rl = RateLimiter(limit=3, window_seconds=60)
        for _ in range(3):
            rl.check("user-a")

    def test_blocks_requests_over_limit(self) -> None:
        rl = RateLimiter(limit=2, window_seconds=60)
        rl.check("user-a")
        rl.check("user-a")
        with pytest.raises(HTTPException) as excinfo:
            rl.check("user-a")
        assert excinfo.value.status_code == 429
        assert excinfo.value.headers is not None
        assert "Retry-After" in excinfo.value.headers

    def test_keys_are_independent(self) -> None:
        rl = RateLimiter(limit=1, window_seconds=60)
        rl.check("user-a")
        rl.check("user-b")  # separate user — own counter
        with pytest.raises(HTTPException):
            rl.check("user-a")

    def test_window_resets_after_expiry(self) -> None:
        rl = RateLimiter(limit=1, window_seconds=1)
        rl.check("user-a")
        with pytest.raises(HTTPException):
            rl.check("user-a")
        time.sleep(1.1)
        rl.check("user-a")  # window reset

    def test_reset_clears_all_entries(self) -> None:
        rl = RateLimiter(limit=1, window_seconds=60)
        rl.check("user-a")
        rl.reset()
        rl.check("user-a")  # counter is gone, fresh slot

    def test_rejects_non_positive_config(self) -> None:
        with pytest.raises(ValueError):
            RateLimiter(limit=0, window_seconds=60)
        with pytest.raises(ValueError):
            RateLimiter(limit=1, window_seconds=0)
