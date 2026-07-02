"""API request and response models."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Response for health check endpoint."""

    status: str = "ok"
    version: str = "0.1.0"
    environment: str = "development"


class MessageInput(BaseModel):
    """Structured user message input.

    Use the `option_selected` form when the user clicks a quick-reply or
    selects from a UI option list — the agent treats it as the same shape
    as free text but logs the option ID for analytics.
    """

    type: Literal["free_text", "option_selected"] = Field(
        default="free_text", description="Type of user input"
    )
    content: str = Field(..., description="Message content or selected option text")
    option_id: str | None = Field(
        default=None, description="Selected option ID if type is option_selected"
    )


class ChatRequest(BaseModel):
    """Request body for the /chat endpoint.

    Add app-specific context fields (e.g. current page state, selection,
    feature flags) here as `Optional[YourContext]` properties. The agent's
    `_build_messages` method is responsible for stringifying them into the
    prompt.
    """

    message: MessageInput | str = Field(
        ..., description="User message (string or structured input)"
    )
    conversation_id: str | None = Field(
        default=None, description="Conversation ID for context continuity"
    )
