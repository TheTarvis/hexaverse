"""Async HTTP client for the Go backend, with token passthrough.

The agent never queries the backend on its own behalf — it queries it as
the user. Every call attaches the user's Firebase token as a Bearer header,
so the backend's auth middleware enforces the same permissions it would
enforce for a frontend request. There is no service-account auth path; if
the user's token can't see something, the agent can't see it either.

Tools call this client via methods like `get(ctx, path)` / `post(ctx, path,
json=...)`. They get back a parsed JSON dict, or one of the typed errors
below. Domain-specific endpoint methods can be added as needed (e.g.
`get_widget(ctx, id)`) — keep them thin wrappers around `get`/`post`.
"""

from typing import Any

import httpx
import structlog

from src.config import get_settings
from src.models.context import RequestContext

logger = structlog.get_logger()


class BackendApiError(Exception):
    """Base error for backend API failures."""

    def __init__(self, status_code: int, message: str, details: dict | None = None):
        self.status_code = status_code
        self.message = message
        self.details = details or {}
        super().__init__(message)


class NotFoundError(BackendApiError):
    """Resource not found (404)."""

    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            status_code=404,
            message=f"{resource_type} '{resource_id}' not found",
            details={"resource_type": resource_type, "resource_id": resource_id},
        )


class ForbiddenError(BackendApiError):
    """User doesn't have permission (403)."""

    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            status_code=403,
            message=f"You don't have permission to access this {resource_type}",
            details={"resource_type": resource_type, "resource_id": resource_id},
        )


class UnauthorizedError(BackendApiError):
    """Token rejected by backend (401)."""

    def __init__(self) -> None:
        super().__init__(
            status_code=401,
            message="Authentication failed - please refresh and try again",
        )


class BackendApiClient:
    """Async HTTP client for the Go backend with user-token passthrough."""

    def __init__(self, base_url: str | None = None) -> None:
        settings = get_settings()
        self.base_url = base_url or settings.backend_api_url
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def request(
        self,
        method: str,
        path: str,
        ctx: RequestContext,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> dict[str, Any]:
        """Make an authenticated request to the Go backend.

        Args:
            method: HTTP method (GET, POST, PATCH, DELETE).
            path: API path beginning with `/`, e.g. `/v1/account/me`.
            ctx: Request context with the user's Firebase token.
            params: Optional query parameters.
            json_body: Optional JSON request body.

        Returns:
            Parsed JSON response. Empty body returns `{}`.

        Raises:
            UnauthorizedError: 401 from backend.
            ForbiddenError:    403 from backend.
            NotFoundError:     404 from backend.
            BackendApiError:   any other non-2xx response or network error.
        """
        client = await self._get_client()
        url = f"{self.base_url}{path}"

        logger.debug("backend_api_request", method=method, path=path, user_id=ctx.user_id)

        try:
            response = await client.request(
                method,
                url,
                headers={
                    "Authorization": f"Bearer {ctx.token}",
                    "Content-Type": "application/json",
                },
                params=params,
                json=json_body,
            )
        except httpx.RequestError as e:
            logger.error("backend_api_connection_error", error=str(e), path=path)
            raise BackendApiError(
                status_code=503,
                message="Failed to connect to the backend",
            ) from e

        if response.status_code == 401:
            raise UnauthorizedError()
        if response.status_code == 403:
            raise ForbiddenError("resource", path)
        if response.status_code == 404:
            raise NotFoundError("resource", path)
        if not response.is_success:
            logger.warning(
                "backend_api_error",
                status_code=response.status_code,
                path=path,
                response_text=response.text[:500],
            )
            raise BackendApiError(
                status_code=response.status_code,
                message=f"API request failed: {response.status_code}",
            )

        # Empty 204/205 bodies → return empty dict so callers don't crash on .json()
        if not response.content:
            return {}
        return response.json()

    async def get(self, ctx: RequestContext, path: str, **params: Any) -> dict[str, Any]:
        return await self.request("GET", path, ctx, params=params or None)

    async def post(
        self, ctx: RequestContext, path: str, json: dict | None = None
    ) -> dict[str, Any]:
        return await self.request("POST", path, ctx, json_body=json)

    async def patch(
        self, ctx: RequestContext, path: str, json: dict | None = None
    ) -> dict[str, Any]:
        return await self.request("PATCH", path, ctx, json_body=json)

    async def delete(self, ctx: RequestContext, path: str) -> dict[str, Any]:
        return await self.request("DELETE", path, ctx)
