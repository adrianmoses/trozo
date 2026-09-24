# trozo

A web tool that turns an English phrase into reusable Spanish chunks — patterns like **tener ganas de** + inf. — with regional variants, derived confidence labels, and warnings about calques and false friends. See `docs/specs/` for the product overview, architecture, and roadmap; `docs/Chunks Translator — Spec.md` is the original design doc.

## Layout

| Path               | What it is                                                                           |
| ------------------ | ------------------------------------------------------------------------------------ |
| `apps/web`         | TanStack Start app (React 19, TanStack Router/Query, Tailwind 4, Drizzle + Postgres) |
| `services/chunker` | FastAPI chunk service (Python 3.12, Pydantic v2, managed with uv)                    |
| `evals/`           | Eval harness: seed set, runner, reports (stub until feature 001)                     |
| `packages/schema`  | API contract: JSON Schema from Pydantic → generated TS types (stub)                  |
| `docs/specs/`      | Spec suite: OVERVIEW, ARCHITECTURE, ROADMAP, per-feature specs                       |

## Getting started

Prerequisites: Node 24+, [pnpm](https://pnpm.io) 9, [uv](https://docs.astral.sh/uv/), Docker.

```bash
pnpm install                 # JS workspaces (apps/web, packages/*)
pnpm dev                     # web app on http://localhost:3000
pnpm test                    # Vitest (apps/web)
pnpm build                   # production build → apps/web/.output

cd services/chunker
uv sync                      # Python deps
uv run uvicorn app.main:app --port 8000   # chunk service
uv run pytest                # service tests

cd ../evals
uv run run.py                # eval runner (placeholder)
```

## Environment

| Variable            | Used by             | Default                 | Purpose                                                                                      |
| ------------------- | ------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | chunker             | —                       | Primary model access.                                                                        |
| `CHUNKER_URL`       | web                 | `http://localhost:8000` | Where the web app's server functions reach the chunk service. The browser never calls it.    |
| `CHUNKER_TOKEN`     | chunker, web, evals | unset                   | Optional shared secret. When set, `POST /v1/chunk` requires `Authorization: Bearer <token>`. |

## Full stack via Docker

```bash
docker compose up --build
```

Starts web (`:3000`), the chunk service (`:8000`, health at `/v1/health`), and Postgres 16 (`:5432`, user/password/db `trozo`).

## Database

Drizzle config lives in `apps/web`. With `DATABASE_URL` set (see docker-compose for the local URL):

```bash
pnpm --filter web db:generate   # generate migrations from schema
pnpm --filter web db:migrate    # apply migrations
pnpm --filter web db:studio     # inspect
```

Tables arrive with feature 004 (`saved_chunks`, `chunk_cache`).
