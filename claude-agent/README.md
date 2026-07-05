# Hexaverse Claude Agent

Python (FastAPI) service that runs a Claude-powered agent with tool calling. Streams chat responses to the frontend over SSE.

## Quickstart

```bash
cd claude-agent

# 1. Install deps
uv sync

# 2. Configure
cp .env.example .env
# Fill in at least: ANTHROPIC_API_KEY, FIREBASE_PROJECT_ID

# 3. Run
uv run python -m src.main           # → http://localhost:8100
```

## Test

```bash
uv run pytest
```

## What's here

| File | Purpose |
|---|---|
| `src/main.py` | FastAPI app, CORS, `/health`, `/chat`. |
| `src/agent.py` | The streaming tool-call loop. |
| `src/tools.py` | `TOOLS` schema list + `execute_tool` dispatcher. **Add tools here.** |
| `src/prompts.py` | System prompt. **Edit `APP_INSTRUCTIONS` for your app.** |
| `src/clients/backend_api.py` | HTTP client for the Go backend with token passthrough. |
| `src/middleware/auth.py` | Firebase ID token verification. |
| `src/middleware/rate_limit.py` | Per-user fixed-window limiter on `/chat`. |

For the full design, the chat-turn flow, and a step-by-step "add a tool" recipe, see [`CLAUDE.md`](./CLAUDE.md).
