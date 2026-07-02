"""Agent — the streaming tool-calling loop.

Receives a `ChatRequest`, calls Claude with the user's message + tools,
streams text deltas + tool-use events back to the caller as a sequence of
SSE-friendly dicts, executes any tool calls, feeds results back into the
conversation, and loops until Claude is done (or `MAX_ITERATIONS`).

Conversation history persistence is left to the host app — override
`Agent._load_conversation_history` and `_save_conversation_history` if you
want multi-turn memory across requests. The default impl is a no-op so
single-turn chats Just Work.
"""

import json
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import anthropic
import structlog

from src.clients.backend_api import BackendApiClient
from src.config import get_settings
from src.models.api import ChatRequest
from src.models.context import RequestContext
from src.prompts import get_system_prompt
from src.tools import TOOLS, execute_tool

logger = structlog.get_logger()


MAX_ITERATIONS = 10  # Hard cap to prevent runaway tool-call loops.


class Agent:
    """Streaming tool-calling agent.

    Subclass and override `_load_conversation_history` /
    `_save_conversation_history` to add persistence backed by your storage
    of choice (Firestore, Redis, etc.).
    """

    def __init__(
        self,
        ctx: RequestContext,
        api_client: BackendApiClient,
        client: anthropic.AsyncAnthropic,
    ) -> None:
        self.ctx = ctx
        self.api_client = api_client
        self.client = client

        settings = get_settings()
        self.model = settings.agent_default_model
        self.ack_model = settings.agent_ack_model
        self.max_tokens = settings.agent_max_tokens

        self.conversation_id: str | None = None
        self._final_messages: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def chat(self, request: ChatRequest) -> AsyncGenerator[dict[str, Any], None]:
        """Process one chat turn and stream events.

        Yields dicts shaped like `{"event": "<name>", "data": {...}}`. The
        FastAPI layer formats these as SSE frames.
        """
        self.conversation_id = request.conversation_id or str(uuid.uuid4())

        logger.info(
            "chat_started",
            user_id=self.ctx.user_id,
            conversation_id=self.conversation_id,
        )

        history: list[dict[str, Any]] = []
        if request.conversation_id:
            history = await self._load_conversation_history(request.conversation_id)

        messages = self._build_messages(request, history=history)

        ack = await self._generate_acknowledgment(request)
        if ack:
            yield {"event": "message", "data": {"type": "text_delta", "content": ack}}

        self._final_messages = []
        async for event in self._run_agent_loop(messages):
            yield event

        await self._save_conversation_history(self.conversation_id, self._final_messages)

        yield {"event": "done", "data": {"conversation_id": self.conversation_id}}

    # ------------------------------------------------------------------
    # Override these for persistence
    # ------------------------------------------------------------------

    async def _load_conversation_history(self, conversation_id: str) -> list[dict[str, Any]]:
        """Load prior conversation messages. Default: empty (single-turn only).

        Override to read from your store of choice. Apply
        `_repair_conversation_history` to the result so a half-saved turn
        doesn't poison the next request.
        """
        _ = conversation_id
        return []

    async def _save_conversation_history(
        self,
        conversation_id: str,
        messages: list[dict[str, Any]],
    ) -> None:
        """Persist conversation messages. Default: no-op.

        Override to write to your store of choice. Use
        `_strip_thinking_blocks` first — thinking blocks are large, are not
        accepted as input on the next turn, and aren't useful for replay.
        """
        _ = conversation_id, messages

    # ------------------------------------------------------------------
    # The streaming tool-call loop
    # ------------------------------------------------------------------

    async def _run_agent_loop(
        self,
        messages: list[dict[str, Any]],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run the streaming + tool-execution loop until end_turn or cap."""
        system_prompt = get_system_prompt()

        # Prompt caching cuts cost on multi-turn conversations where the
        # system prompt is identical.
        system_with_cache = [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        current_messages = messages.copy()
        self._final_messages = current_messages

        for iteration in range(MAX_ITERATIONS):
            logger.debug(
                "agent_iteration",
                iteration=iteration,
                message_count=len(current_messages),
            )

            try:
                async with self.client.messages.stream(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    system=system_with_cache,  # type: ignore[arg-type]
                    tools=TOOLS,  # type: ignore[arg-type]
                    messages=current_messages,  # type: ignore[arg-type]
                ) as stream:
                    async for event in stream:
                        if event.type == "content_block_delta":
                            if event.delta.type == "text_delta":
                                yield {
                                    "event": "message",
                                    "data": {
                                        "type": "text_delta",
                                        "content": event.delta.text,
                                    },
                                }
                        elif (
                            event.type == "content_block_start"
                            and event.content_block.type == "tool_use"
                        ):
                            yield {
                                "event": "message",
                                "data": {
                                    "type": "tool_use",
                                    "tool": event.content_block.name,
                                    "status": "running",
                                },
                            }

                    response = await stream.get_final_message()

            except anthropic.APIError as e:
                logger.error(
                    "claude_api_error",
                    error=str(e),
                    status=getattr(e, "status_code", None),
                )
                yield {
                    "event": "error",
                    "data": {
                        "error": "Something went wrong while processing your request. Please try again.",
                    },
                }
                return

            # Reconstruct the assistant message for the conversation history,
            # and gather any tool calls we need to execute.
            assistant_content: list[dict[str, Any]] = []
            tool_calls_to_process: list[dict[str, Any]] = []

            for block in response.content:
                if block.type == "text":
                    assistant_content.append({"type": "text", "text": block.text})
                elif block.type == "thinking":
                    assistant_content.append(
                        {
                            "type": "thinking",
                            "thinking": block.thinking,
                            "signature": block.signature,
                        }
                    )
                elif block.type == "tool_use":
                    assistant_content.append(
                        {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        }
                    )
                    tool_calls_to_process.append(
                        {"id": block.id, "name": block.name, "input": block.input}
                    )

            current_messages.append({"role": "assistant", "content": assistant_content})

            if response.stop_reason == "end_turn" or not tool_calls_to_process:
                logger.debug("agent_loop_complete", reason=response.stop_reason)
                return

            tool_results: list[dict[str, Any]] = []
            for tool_call in tool_calls_to_process:
                tool_name = tool_call["name"]
                result = await execute_tool(
                    tool_name=tool_name,
                    tool_input=tool_call["input"],
                    ctx=self.ctx,
                    api_client=self.api_client,
                )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_call["id"],
                        "content": json.dumps(result),
                    }
                )
                yield {
                    "event": "message",
                    "data": {
                        "type": "tool_result",
                        "tool": tool_name,
                        "status": "complete",
                    },
                }

            # Append all tool results in a single user message — Claude
            # expects them grouped in one block per assistant message that
            # contained tool_use entries.
            current_messages.append({"role": "user", "content": tool_results})

        logger.warning("agent_max_iterations_reached")
        yield {
            "event": "message",
            "data": {
                "type": "text",
                "content": "I've reached my limit for this turn. Please let me know if you need anything else.",
            },
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        request: ChatRequest,
        history: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """Compose the message array sent to Claude.

        Override to inject app-specific context (current page state,
        selection, feature flags, etc.) ahead of the user's message.
        """
        messages: list[dict[str, Any]] = list(history) if history else []

        if isinstance(request.message, str):
            user_content = request.message
        else:
            user_content = request.message.content

        if user_content.strip():
            messages.append({"role": "user", "content": user_content})

        return messages

    async def _generate_acknowledgment(self, request: ChatRequest) -> str | None:
        """Generate a one-line "I'm working on it" using a fast model.

        Streams immediately so the user sees feedback while Claude thinks.
        Returns None for short messages (the main response will be fast
        enough that the ack would just feel like clutter).
        """
        user_message = (
            request.message if isinstance(request.message, str) else request.message.content
        )

        if len(user_message.strip()) < 15:
            return None

        try:
            response = await self.client.messages.create(
                model=self.ack_model,
                max_tokens=60,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f'The user said: "{user_message}"\n\n'
                            "Write a brief 5-10 word acknowledgment that shows "
                            "you understand what they want. Start with a verb. "
                            "Examples: 'Looking that up...', 'Checking your "
                            "account...', 'Let me think...'. "
                            "Reply with ONLY the acknowledgment, nothing else."
                        ),
                    }
                ],
            )
            block = response.content[0]
            if block.type != "text":
                return None
            ack = block.text.strip()
            if not ack.endswith("..."):
                ack = ack.rstrip(".") + "..."
            return ack + "\n\n"
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Conversation-history utilities (used by override-friendly persistence)
    # ------------------------------------------------------------------

    @staticmethod
    def strip_thinking_blocks(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Remove `thinking` blocks from assistant messages before persisting.

        Thinking blocks are large, aren't accepted as input on the next turn,
        and aren't useful for replay. Strip before saving.
        """
        cleaned: list[dict[str, Any]] = []
        for msg in messages:
            if msg.get("role") == "assistant" and isinstance(msg.get("content"), list):
                filtered = [
                    block
                    for block in msg["content"]
                    if not (isinstance(block, dict) and block.get("type") == "thinking")
                ]
                cleaned.append({**msg, "content": filtered})
            else:
                cleaned.append(msg)
        return cleaned

    @staticmethod
    def repair_conversation_history(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Truncate orphaned tool_use blocks at the tail.

        If the last assistant message has tool_use blocks but the next user
        message doesn't have matching tool_results, the API rejects the
        whole history. Drop the trailing turn so resume works.
        """
        if not messages:
            return messages

        for i in range(len(messages) - 1, -1, -1):
            msg = messages[i]
            if msg.get("role") != "assistant":
                continue
            content = msg.get("content", [])
            if not isinstance(content, list):
                continue

            tool_use_ids = {
                block["id"]
                for block in content
                if isinstance(block, dict) and block.get("type") == "tool_use"
            }
            if not tool_use_ids:
                continue

            if i + 1 < len(messages):
                next_content = messages[i + 1].get("content", [])
                if isinstance(next_content, list):
                    result_ids = {
                        block.get("tool_use_id")
                        for block in next_content
                        if isinstance(block, dict) and block.get("type") == "tool_result"
                    }
                    if tool_use_ids <= result_ids:
                        break  # History is valid.

            logger.warning(
                "conversation_history_repaired",
                truncated_at=i,
                original_length=len(messages),
                orphaned_tool_ids=list(tool_use_ids),
            )
            return messages[:i]

        return messages
