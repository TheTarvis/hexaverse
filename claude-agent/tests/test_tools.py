"""Tests for the TOOLS schema list and execute_tool dispatcher."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

from src.clients.backend_api import (
    BackendApiError,
    ForbiddenError,
    NotFoundError,
)
from src.models.context import RequestContext
from src.tools import TOOLS, execute_tool


class TestToolSchemas:
    def test_tools_is_nonempty_list(self) -> None:
        assert isinstance(TOOLS, list)
        assert TOOLS

    def test_every_tool_has_required_fields(self) -> None:
        for tool in TOOLS:
            assert isinstance(tool.get("name"), str) and tool["name"], tool
            assert isinstance(tool.get("description"), str) and tool["description"], tool
            assert isinstance(tool.get("input_schema"), dict), tool
            assert tool["input_schema"].get("type") == "object", tool

    def test_tool_names_are_unique(self) -> None:
        names = [tool["name"] for tool in TOOLS]
        assert len(names) == len(set(names))

    def test_expected_tools_present(self) -> None:
        names = {tool["name"] for tool in TOOLS}
        assert "current_time" in names
        assert "fetch_account_profile" in names

    async def test_every_tool_dispatches(self, mock_request_context: RequestContext) -> None:
        """Every schema entry has a matching handler in the dispatcher."""
        api = AsyncMock()
        api.get.return_value = {}
        for tool in TOOLS:
            # Unknown tools return an "Unknown tool" error; wired tools never do.
            result = await execute_tool(tool["name"], {}, mock_request_context, api)
            assert result.get("error") != f"Unknown tool: {tool['name']}"


class TestExecuteToolDispatch:
    async def test_current_time_returns_iso_utc(self, mock_request_context: RequestContext) -> None:
        api = AsyncMock()
        result = await execute_tool("current_time", {}, mock_request_context, api)
        assert set(result) == {"now"}
        parsed = datetime.fromisoformat(result["now"])
        assert parsed.tzinfo is not None
        assert parsed.utcoffset() == datetime.now(UTC).utcoffset()
        # No backend I/O for this tool.
        api.get.assert_not_called()

    async def test_fetch_account_profile_calls_backend(
        self, mock_request_context: RequestContext
    ) -> None:
        api = AsyncMock()
        api.get.return_value = {"name": "Trav", "email": "test@example.com"}

        result = await execute_tool("fetch_account_profile", {}, mock_request_context, api)

        api.get.assert_awaited_once_with(mock_request_context, "/v1/account/me")
        assert result == {"profile": {"name": "Trav", "email": "test@example.com"}}

    async def test_unknown_tool_returns_error(self, mock_request_context: RequestContext) -> None:
        api = AsyncMock()
        result = await execute_tool("does_not_exist", {}, mock_request_context, api)
        assert result == {"error": "Unknown tool: does_not_exist"}
        api.get.assert_not_called()


class TestExecuteToolErrorHandling:
    async def test_not_found_error_surfaces_message(
        self, mock_request_context: RequestContext
    ) -> None:
        api = AsyncMock()
        api.get.side_effect = NotFoundError("account", "me")

        result = await execute_tool("fetch_account_profile", {}, mock_request_context, api)

        assert result == {"error": "account 'me' not found"}

    async def test_forbidden_error_surfaces_message(
        self, mock_request_context: RequestContext
    ) -> None:
        api = AsyncMock()
        api.get.side_effect = ForbiddenError("account", "me")

        result = await execute_tool("fetch_account_profile", {}, mock_request_context, api)

        assert result == {"error": "You don't have permission to access this account"}

    async def test_backend_api_error_surfaces_message(
        self, mock_request_context: RequestContext
    ) -> None:
        api = AsyncMock()
        api.get.side_effect = BackendApiError(status_code=503, message="Backend is down")

        result = await execute_tool("fetch_account_profile", {}, mock_request_context, api)

        assert result == {"error": "Backend is down"}

    async def test_unexpected_exception_converted_to_error(
        self, mock_request_context: RequestContext
    ) -> None:
        api = AsyncMock()
        api.get.side_effect = RuntimeError("boom")

        result = await execute_tool("fetch_account_profile", {}, mock_request_context, api)

        assert result == {"error": "Tool fetch_account_profile failed: boom"}
