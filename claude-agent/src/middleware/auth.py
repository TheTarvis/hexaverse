"""Firebase authentication middleware."""

import os

import firebase_admin
import structlog
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from src.config import get_settings
from src.models.context import RequestContext

logger = structlog.get_logger()

# Firebase app instance (initialized once)
_firebase_app: firebase_admin.App | None = None


def init_firebase() -> None:
    """Initialize Firebase Admin SDK.

    Called once at application startup. Uses Application Default Credentials
    in Cloud Run, or GOOGLE_APPLICATION_CREDENTIALS locally.

    For local development with the Firebase emulator, set
    FIREBASE_AUTH_EMULATOR_HOST in the environment (e.g. "localhost:20211").
    """
    global _firebase_app

    if _firebase_app is not None:
        return

    settings = get_settings()

    # Set emulator host env var if configured (must be set before init).
    if settings.firebase_auth_emulator_host:
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.firebase_auth_emulator_host
        logger.info(
            "firebase_using_emulator",
            emulator_host=settings.firebase_auth_emulator_host,
        )

    try:
        # ADC in Cloud Run, or local service account file via
        # GOOGLE_APPLICATION_CREDENTIALS. The emulator ignores the credential
        # but firebase-admin still requires one to initialize.
        cred = credentials.ApplicationDefault()
        _firebase_app = firebase_admin.initialize_app(
            cred,
            options={"projectId": settings.firebase_project_id},
        )
        logger.info(
            "firebase_initialized",
            project_id=settings.firebase_project_id,
            using_emulator=bool(settings.firebase_auth_emulator_host),
        )
    except Exception as e:
        logger.error("firebase_init_failed", error=str(e))
        raise


async def get_request_context(
    authorization: str | None = Header(None),
) -> RequestContext:
    """FastAPI dependency that verifies the Firebase ID token and returns context.

    The raw token is preserved on the context so tool handlers can pass it
    through to the Go backend (which enforces its own auth).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.removeprefix("Bearer ")

    try:
        decoded = firebase_auth.verify_id_token(token)
    except firebase_auth.ExpiredIdTokenError:
        logger.warning("expired_token")
        raise HTTPException(status_code=401, detail="Token expired") from None
    except firebase_auth.InvalidIdTokenError as e:
        logger.warning("invalid_token", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid token") from None
    except Exception as e:
        logger.error("token_verification_failed", error=str(e))
        raise HTTPException(status_code=401, detail="Token verification failed") from None

    ctx = RequestContext(
        user_id=decoded["uid"],
        email=decoded.get("email", ""),
        token=token,
        is_admin=decoded.get("admin", False),
    )

    logger.debug("request_authenticated", user_id=ctx.user_id, email=ctx.email)
    return ctx
