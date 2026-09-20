# Claude Agent

Python (FastAPI) service that runs a Claude-powered conversational agent with tool calling. The frontend hits `/chat`, the agent streams text + tool-use events back as SSE, and the agent calls the Go backend on the user's behalf to do real work.

## Layout

```
claude-agent/
├── src/
│   ├── main.py          # FastAPI app, CORS, /health, /chat, lifespan
│   ├── agent.py         # The streaming tool-call loop
│   ├── tools.py         # TOOLS list + execute_tool dispatcher (add tools here)
│   ├── prompts.py       # System prompt
│   ├── config.py        # Pydantic settings (env-driven)
│   ├── clients/
│   │   └── backend_api.py   # Token-passthrough HTTP client for the Go backend
│   ├── middleware/
│   │   ├── auth.py          # Firebase ID token verification
│   │   └── rate_limit.py    # Per-user fixed-window limiter on /chat
│   └── models/
│       ├── api.py           # ChatRequest, HealthResponse, MessageInput
│       └── context.py       # RequestContext (user_id, email, token)
├── tests/                   # health, rate_limit, main
├── pyproject.toml
├── Dockerfile
├── .env.example
└── README.md
```

## How a chat turn flows

1. Frontend POSTs to `/chat` with a `Bearer <firebase_id_token>` header and a JSON body matching `ChatRequest`.
2. `rate_limited_context` dependency runs auth (`get_request_context`) then enforces the per-user limit. The verified token is preserved on `RequestContext.token` for token passthrough.
3. `Agent.chat` loads any prior conversation history (no-op by default — see Persistence below), generates a quick acknowledgment via Haiku, then enters the agent loop.
4. **Agent loop** (`Agent._run_agent_loop`):
   - Streams `client.messages.stream(...)` with `system`, `tools=TOOLS`, and the conversation so far.
   - Yields `text_delta` events for every token Claude emits.
   - When a `tool_use` block lands, yields a `tool_use` marker, executes the tool via `execute_tool`, appends the `tool_result`, and continues the loop.
   - Stops on `stop_reason == "end_turn"`, no tool calls, or `MAX_ITERATIONS=10`.
5. SSE frames stream back to the frontend.

## Adding a tool

Tools are the agent's capability surface. Three steps:

```python
# 1. src/tools.py — add a schema entry to TOOLS:
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

# 2. src/tools.py — add the handler:
async def _tool_fetch_widget(input, ctx, api):
    widget = await api.get(ctx, f"/v1/widgets/{input['widget_id']}")
    return {"widget": widget}

# 3. src/tools.py — wire it into execute_tool's dispatcher:
handlers = {
    ...
    "fetch_widget": _tool_fetch_widget,
}
```

**Description matters more than name.** Claude picks tools by reading the description. Be specific about *when* to call (e.g. "Use BEFORE add_node to get the correct provider name"), not just *what* it does.

**Return value contract.** Handlers return a JSON-serializable dict. The dispatcher serializes it into the `tool_result` content block on the next turn. Keep it small and structured. Raise on programmer errors — the dispatcher catches and converts to `{"error": "..."}` for the model.

**Auth.** Pass `ctx` to `api.get` / `api.post` calls. The backend enforces auth from the user's token, so the agent inherits the user's permissions for free. Don't add a service-account auth path unless you have a specific reason.

## Adding context to the prompt

App-specific guidance goes in `src/prompts.py` → `APP_INSTRUCTIONS`. Keep `CORE_INSTRUCTIONS` (tool-use guidance, formatting) intact unless you have a strong reason — it's the part that makes tool calling reliable.

If you need to inject *runtime* context (current page state, selected entity, feature flags) on a per-request basis, override `Agent._build_messages` to format it and prepend to the user's message.

## Persistence (conversation history)

The default `Agent._load_conversation_history` and `_save_conversation_history` are no-ops, so chats are single-turn out of the box. To add multi-turn:

1. Subclass `Agent` (or extend it directly), override the two methods.
2. Use `Agent.strip_thinking_blocks(messages)` before saving — thinking blocks aren't accepted as input on the next turn.
3. Use `Agent.repair_conversation_history(messages)` after loading — handles the case where a previous turn died after `tool_use` but before `tool_result`.
4. Wire the new class into `main.py`'s `chat` handler.

## Development

```bash
cd claude-agent
uv sync                       # Install deps
cp .env.example .env          # Fill in ANTHROPIC_API_KEY at minimum
uv run python -m src.main     # Server at :20202
uv run pytest                 # Tests
uv run ruff check src tests   # Lint
uv run pyright src            # Type-check
```

## Deployment

Cloud Run service, defined in `infra/terraform/cloudrun.tf` (`claude_agent` resource block). Built by the GitLab CI pipeline; the Anthropic API key is mounted from Secret Manager.

## API endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | None | Cloud Run liveness probe. |
| `GET /` | None | Service info. |
| `POST /chat` | Bearer Firebase token | Streaming SSE chat with tool calling. |

## Gotchas

- **Firebase ADC locally.** `firebase-admin` needs Application Default Credentials. Either run `gcloud auth application-default login`, or set `FIREBASE_AUTH_EMULATOR_HOST=localhost:20211` and run the auth emulator (no credentials needed).
- **Streaming + nginx buffering.** The `X-Accel-Buffering: no` response header on `/chat` matters in production — Cloud Run's frontend will otherwise buffer the entire stream and the user sees nothing until completion.
- **CORS.** `CORS_ALLOWED_ORIGINS` is a comma-separated list. Default is `http://localhost:3000` — add prod/preview hosts before deploying.
- **Rate limit is per-process.** Multi-instance Cloud Run means the effective limit is `N × RATE_LIMIT_REQUESTS_PER_MINUTE`. Acceptable as a cost-control safety net; tighten with Redis only if needed.
- **Long tool-call chains.** `MAX_ITERATIONS=10` in `agent.py` stops a runaway loop. Bump if you have legitimately long pipelines, but think about caching tool results before raising it much.
