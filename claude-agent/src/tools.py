"""Tool definitions and dispatcher for the agent.

# Adding a tool

A tool is two things: an entry in the `TOOLS` list (the schema Claude sees)
and a handler function that runs when Claude calls it.

```python
# 1. Schema entry — appended to TOOLS:
{
    "name": "fetch_widget",
    "description": "Look up a widget by ID. Use when the user references a widget by name or asks for its details.",
    "input_schema": {
        "type": "object",
        "properties": {
            "widget_id": {"type": "string", "description": "The widget ID."},
        },
        "required": ["widget_id"],
    },
},

# 2. Handler:
async def _fetch_widget(input: dict, ctx: RequestContext, api: BackendApiClient):
    widget = await api.get(ctx, f"/v1/widgets/{input['widget_id']}")
    return {"widget": widget}

# 3. Dispatch — add to the if/elif chain in execute_tool().
```

# Return value contract

Handlers return a JSON-serializable dict. Whatever's in it gets serialized
into the `tool_result` content block that Claude sees on the next turn —
keep it small and structured. If you raise, the dispatcher catches the
exception and turns it into `{"error": "<message>"}` for the model.

# Auth

The `ctx` argument is a `RequestContext` with the user's verified Firebase
token. Pass it to `api.get` / `api.post` calls — the backend enforces auth
based on that token, so the agent inherits the user's permissions for
free.
"""

from datetime import UTC, datetime
from typing import Any

import structlog

from src.clients.backend_api import (
    BackendApiClient,
    BackendApiError,
    ForbiddenError,
    NotFoundError,
)
from src.models.context import RequestContext

logger = structlog.get_logger()


# =============================================================================
# Tool schemas — the list Claude sees on every turn
# =============================================================================

TOOLS: list[dict[str, Any]] = [
    {
        "name": "current_time",
        "description": (
            "Return the current UTC time as an ISO-8601 string. Use when the "
            "user asks for the time, or when you need to anchor a relative "
            'request ("today", "yesterday", "this week") to a concrete date.'
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "fetch_account_profile",
        "description": (
            "Fetch the authenticated user's account profile from the backend "
            "(name, email, joined date). Use when the user refers to their "
            'own account or asks personal questions like "what\'s my email?".'
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


# =============================================================================
# Handlers
# =============================================================================


async def _tool_current_time(
    _input: dict[str, Any],
    _ctx: RequestContext,
    _api: BackendApiClient,
) -> dict[str, Any]:
    """Return current UTC time. Demonstrates the simplest tool shape — no I/O."""
    return {"now": datetime.now(UTC).isoformat()}


async def _tool_fetch_account_profile(
    _input: dict[str, Any],
    ctx: RequestContext,
    api: BackendApiClient,
) -> dict[str, Any]:
    """Fetch the user's own account profile.

    Demonstrates the canonical pattern: call the backend with the user's
    token via `api.get(ctx, ...)`, return the parsed JSON. Backend errors
    are caught by the dispatcher and surfaced to the model.
    """
    profile = await api.get(ctx, "/v1/account/me")
    return {"profile": profile}


# =============================================================================
# Dispatcher
# =============================================================================


async def execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    ctx: RequestContext,
    api_client: BackendApiClient,
) -> dict[str, Any]:
    """Run a tool by name and return its result.

    The agent calls this once per `tool_use` block in Claude's response.
    Whatever this returns gets JSON-serialized into the `tool_result`
    block of the next assistant message, so keep it small and structured.
    """
    handlers = {
        "current_time": _tool_current_time,
        "fetch_account_profile": _tool_fetch_account_profile,
    }

    handler = handlers.get(tool_name)
    if handler is None:
        return {"error": f"Unknown tool: {tool_name}"}

    try:
        return await handler(tool_input, ctx, api_client)
    except (NotFoundError, ForbiddenError, BackendApiError) as e:
        # Domain errors — surface the message but not the stack.
        logger.info("tool_domain_error", tool=tool_name, error=str(e))
        return {"error": e.message}
    except Exception as e:
        logger.exception("tool_unhandled_error", tool=tool_name)
        return {"error": f"Tool {tool_name} failed: {e}"}
