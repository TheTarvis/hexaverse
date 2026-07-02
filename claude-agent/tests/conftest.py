"""Pytest fixtures for testing."""

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.middleware.rate_limit import get_chat_limiter
from src.models.context import RequestContext


@pytest.fixture(autouse=True)
def _reset_chat_limiter() -> None:
    """Clear the shared chat rate limiter between tests.

    The limiter is a module-level singleton, so state leaks between tests if
    we don't reset it. autouse keeps test isolation implicit.
    """
    get_chat_limiter().reset()


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_request_context() -> RequestContext:
    """Mock authenticated request context."""
    return RequestContext(
        user_id="test-user-123",
        email="test@example.com",
        token="mock-firebase-token",
        is_admin=False,
    )
