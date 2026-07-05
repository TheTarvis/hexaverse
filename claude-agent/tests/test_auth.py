"""Tests for the Firebase auth dependency in src/middleware/auth.py."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from firebase_admin import auth as firebase_auth

from src.middleware.auth import get_request_context
from src.models.context import RequestContext

VALID_CLAIMS = {
    "uid": "user-abc-123",
    "email": "traveler@example.com",
}


class TestGetRequestContextSuccess:
    async def test_valid_token_populates_context(self) -> None:
        with patch(
            "src.middleware.auth.firebase_auth.verify_id_token",
            return_value=dict(VALID_CLAIMS),
        ) as mock_verify:
            ctx = await get_request_context(authorization="Bearer good-token")

        mock_verify.assert_called_once_with("good-token")
        assert isinstance(ctx, RequestContext)
        assert ctx.user_id == "user-abc-123"
        assert ctx.email == "traveler@example.com"
        # Raw token is preserved for passthrough to the Go backend.
        assert ctx.token == "good-token"
        assert ctx.is_admin is False

    async def test_admin_claim_sets_is_admin(self) -> None:
        claims = dict(VALID_CLAIMS, admin=True)
        with patch(
            "src.middleware.auth.firebase_auth.verify_id_token",
            return_value=claims,
        ):
            ctx = await get_request_context(authorization="Bearer admin-token")

        assert ctx.is_admin is True

    async def test_missing_email_claim_defaults_to_empty(self) -> None:
        with patch(
            "src.middleware.auth.firebase_auth.verify_id_token",
            return_value={"uid": "user-abc-123"},
        ):
            ctx = await get_request_context(authorization="Bearer no-email-token")

        assert ctx.email == ""


class TestGetRequestContextHeaderValidation:
    async def test_missing_header_returns_401(self) -> None:
        with pytest.raises(HTTPException) as excinfo:
            await get_request_context(authorization=None)
        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "Missing or invalid Authorization header"

    async def test_empty_header_returns_401(self) -> None:
        with pytest.raises(HTTPException) as excinfo:
            await get_request_context(authorization="")
        assert excinfo.value.status_code == 401

    async def test_non_bearer_header_returns_401(self) -> None:
        with pytest.raises(HTTPException) as excinfo:
            await get_request_context(authorization="Basic dXNlcjpwYXNz")
        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "Missing or invalid Authorization header"

    async def test_malformed_header_never_hits_firebase(self) -> None:
        with (
            patch("src.middleware.auth.firebase_auth.verify_id_token") as mock_verify,
            pytest.raises(HTTPException),
        ):
            await get_request_context(authorization="token-without-scheme")
        mock_verify.assert_not_called()


class TestGetRequestContextVerificationFailures:
    async def test_expired_token_returns_401(self) -> None:
        with (
            patch(
                "src.middleware.auth.firebase_auth.verify_id_token",
                side_effect=firebase_auth.ExpiredIdTokenError("Token expired", None),
            ),
            pytest.raises(HTTPException) as excinfo,
        ):
            await get_request_context(authorization="Bearer expired-token")

        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "Token expired"

    async def test_invalid_token_returns_401(self) -> None:
        with (
            patch(
                "src.middleware.auth.firebase_auth.verify_id_token",
                side_effect=firebase_auth.InvalidIdTokenError("Bad signature"),
            ),
            pytest.raises(HTTPException) as excinfo,
        ):
            await get_request_context(authorization="Bearer bad-token")

        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "Invalid token"

    async def test_unexpected_verification_error_returns_401(self) -> None:
        with (
            patch(
                "src.middleware.auth.firebase_auth.verify_id_token",
                side_effect=RuntimeError("certificate fetch failed"),
            ),
            pytest.raises(HTTPException) as excinfo,
        ):
            await get_request_context(authorization="Bearer any-token")

        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "Token verification failed"
