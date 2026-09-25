# trozo

A web tool that turns an English phrase into reusable Spanish chunks — patterns like **tener ganas de** + inf. — with regional variants, derived confidence labels, and warnings about calques and false friends. The eval harness is a first-class part of the project: every prompt or model change is measured against a seed set.

See `docs/specs/` for the product overview, architecture, roadmap and per-feature specs and decision records; `bugs/` for bug fix records; `docs/Chunks Translator — Spec.md` is the original design doc.

## Status

| Feature                                                                                                     | State       |
| ----------------------------------------------------------------------------------------------------------- | ----------- |
| 001 Chunk service + seed v0 (30 items) + eval runner                                                        | implemented |
| 002 Translator UI at `/` (dark theme, traps box, chunk cards, copy)                                         | implemented |
| 003 Full confidence (self-consistency + OpenAI verifier, background upgrade in the UI, calibration metrics) | implemented |
| 004 Saving + export (Postgres, `/saved`, Anki CSV / TXT)                                                    | planned     |
| 005 Seed to 120 + eval report                                                                               | planned     |

## Layout

| Path               | What it is                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `apps/web`         | TanStack Start app (React 19, TanStack Router/Query, Tailwind 4, shadcn/ui, Drizzle + Postgres)                   |
| `services/chunker` | FastAPI chunk service (Python 3.12, Pydantic v2, managed with uv): generation, validation, confidence             |
| `evals/`           | Eval harness: seed set, poison claims, runner, threshold sweep; results and reports in `evals/results/` (ignored) |
| `packages/schema`  | API contract: JSON Schema exported from the Pydantic models and TS types generated from it                        |
| `docs/specs/`      | Spec suite: OVERVIEW, ARCHITECTURE, ROADMAP, per-feature spec and decision record                                 |
| `bugs/`            | Bug fix records                                                                                                   |

## Getting started

Prerequisites: Node 24+, [pnpm](https://pnpm.io) 9, [uv](https://docs.astral.sh/uv/), Docker (for the full stack only).

Put your keys in `.env.local` at the repo root (gitignored):

```bash
ANTHROPIC_KEY=...     # primary model; mapped to ANTHROPIC_API_KEY for the chunker
OPENAI_API_KEY=...    # optional: verifier for full confidence
```

Run the chunk service and the web app together, with reload on both (uses `uvx honcho` and the root `Procfile`, which loads `.env.local`):

```bash
pnpm install
pnpm dev:all                 # chunker on :8000, web on :3000; Ctrl+C stops both
```

Or run pieces individually:

```bash
pnpm dev                     # web app on http://localhost:3000
pnpm test                    # Vitest (apps/web) + schema type check (packages/schema)
pnpm lint                    # ESLint (apps/web)
pnpm check                   # Prettier
pnpm build                   # production build → apps/web/.output

cd services/chunker
uv sync
export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_KEY=' ../../.env.local | cut -d= -f2-)"
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' ../../.env.local | cut -d= -f2-)"   # optional
uv run uvicorn app.main:app --port 8000 --reload
uv run pytest                # service tests (LLM calls faked)
```

## Evals

The runner calls the running chunk service over HTTP, exactly like the UI. Start the service first.

```bash
cd evals
uv run run.py --prompt p1 --split dev                        # fast mode: chunk recall, calque rate
uv run run.py --prompt p1 --split test --confidence full \
  --verifier gpt-5.4-mini                                    # + confidence metrics
uv run tune.py results/<stamp>-p1-dev-full.jsonl             # threshold sweep, no LLM calls

cd ../services/chunker                                       # scripts need the keys exported:
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' ../../.env.local | cut -d= -f2-)"
uv run scripts/poison.py                                     # verifier catch rate on wrong claims
uv run scripts/spike_full.py [--perturb]                     # 003 variance / verifier spike
```

Splits: `dev` (prompt tuning, few-shot source) and `test` (report only). Each run writes to `evals/results/`: raw JSONL, a `.summary.json`, and a Markdown report with deltas against the previous run with the same split and mode. Full-mode metrics mask the seed rule, since every expected chunk is in the seed: high-label precision, accuracy per confidence bucket, the consistency histogram and verifier agreement. Correctness is "matches an expected chunk", which understates precision for valid chunks the seed does not list.

## API

The chunk service is internal: the browser only talks to the web app's server functions.

| Endpoint         | Purpose                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/chunk` | `{text, preferred_region, confidence_mode: fast\|full}` → translation, chunks, notes, meta. Guarded by `CHUNKER_TOKEN` when set. |
| `GET /v1/meta`   | Regions, note kinds, prompt version, verifier model, full-confidence sample count and thresholds                                 |
| `GET /v1/health` | Liveness                                                                                                                         |

The contract lives in the Pydantic models (`services/chunker/app/models.py`); regenerate the shared schema and TS types after changing them (see `packages/schema/README.md`).

## Environment

| Variable                 | Used by             | Default                            | Purpose                                                                                                           |
| ------------------------ | ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`      | chunker             | —                                  | Primary model access. `.env.local` stores it as `ANTHROPIC_KEY`; the Procfile maps it.                            |
| `CHUNKER_PRIMARY_MODEL`  | chunker             | `claude-sonnet-5`                  | Generation model.                                                                                                 |
| `CHUNKER_EFFORT`         | chunker             | `medium`                           | Generation depth (the model takes no sampling parameters).                                                        |
| `CHUNKER_PROMPT_VERSION` | chunker             | `p1`                               | Prompt file under `services/chunker/prompts/`; logged in every response and eval run.                             |
| `OPENAI_API_KEY`         | chunker             | unset                              | Verifier for full confidence. Unset: full mode uses self-consistency only.                                        |
| `CHUNKER_VERIFIER_MODEL` | chunker             | `gpt-5.4-mini`                     | OpenAI model that checks chunk and region claims.                                                                 |
| `CHUNKER_SAMPLE_PERTURB` | chunker             | off                                | Reorder few-shot examples per self-consistency sample. Off by default (the 003 spike found it added no variance). |
| `CHUNKER_SEED_PATH`      | chunker             | `evals/seed/seed_v0.yaml`          | Seed list for "verified" confidence.                                                                              |
| `CHUNKER_CACHE_DIR`      | chunker             | `.cache/chunker` (relative to cwd) | Disk response cache.                                                                                              |
| `CHUNKER_URL`            | web                 | `http://localhost:8000`            | Where the web app's server functions reach the chunk service.                                                     |
| `CHUNKER_TOKEN`          | chunker, web, evals | unset                              | Optional shared secret. When set, `POST /v1/chunk` requires `Authorization: Bearer <token>`.                      |
| `DATABASE_URL`           | web                 | —                                  | Postgres (used from 004).                                                                                         |

## Full stack via Docker

Compose reads keys from your shell or a root `.env`, not `.env.local`, so export them first:

```bash
export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_KEY=' .env.local | cut -d= -f2-)"
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)"
docker compose up --build
```

Starts web (`:3000`), the chunk service (`:8000`, health at `/v1/health`), and Postgres 16 (`:5432`, user/password/db `trozo`). Images do not hot-reload; use `pnpm dev:all` for development.

## Database

Drizzle config lives in `apps/web`. With `DATABASE_URL` set (see docker-compose for the local URL):

```bash
pnpm --filter web db:generate   # generate migrations from schema
pnpm --filter web db:migrate    # apply migrations
pnpm --filter web db:studio     # inspect
```

The `saved_chunks` table arrives with feature 004. The response cache is a disk cache inside the chunk service, not a database table.
