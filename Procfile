# Local development: `pnpm dev:all` (runs `uvx honcho -e .env.local start`).
# .env.local stores the key as ANTHROPIC_KEY; the Anthropic SDK reads ANTHROPIC_API_KEY.
# honcho assigns PORT per process, and the web dev server prefers PORT over its
# --port flag, so both ports are pinned here.
chunker: cd services/chunker && ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$ANTHROPIC_KEY}" exec uv run uvicorn app.main:app --port 8000 --reload
web: PORT=3000 exec pnpm dev
