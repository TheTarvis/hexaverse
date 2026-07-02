"""Request context for authenticated requests."""

from dataclasses import dataclass


@dataclass
class RequestContext:
    """Context extracted from an authenticated request.

    Passed to all tool handlers so they can call the Go backend with the
    user's Firebase token (token passthrough — backend enforces auth).
    """

    user_id: str  # Firebase UID
    email: str  # From token claims
    token: str  # Raw Firebase token, for passthrough to the Go backend
    is_admin: bool = False  # From token custom claims
