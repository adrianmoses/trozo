# trozo

A web tool that turns an English phrase into reusable Spanish chunks — patterns like **tener ganas de** + inf. — with regional variants, derived confidence labels, and warnings about calques and false friends. The eval harness is a first-class part of the project: every prompt or model change is measured against a seed set.

See `docs/specs/` for the product overview, architecture, roadmap and per-feature specs and decision records; `bugs/` for bug fix records; `docs/Chunks Translator — Spec.md` is the original design doc.

## Status

| Feature                                                                                                     | State       |
| ----------------------------------------------------------------------------------------------------------- | ----------- |
| 001 Chunk service + seed v0 (30 items) + eval runner                                                        | implemented |
| 002 Translator UI at `/` (dark theme, traps box, chunk cards, copy)                                         | implemented |
| 003 Full confidence (self-consistency + OpenAI verifier, background upgrade in the UI, calibration metrics) | implemented |
| 004 Saving + export (Postgres, `/saved`, Anki CSV / TXT)                                                    | implemented |
| 005 Seed to 120 + eval report                                                                               | implemented |

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

The runner calls the running chunk service over HTTP, exactly like the UI. Start the service first; `CHUNKER_PROMPT_VERSION` picks the prompt it serves.

```bash
cd evals
uv run run.py --prompt p1 --split dev                        # fast mode: recall, calques, region metrics
uv run run.py --prompt p1 --split test --confidence full \
  --verifier gpt-5.4-mini                                    # + confidence metrics
uv run tune.py results/<stamp>-p1-dev-full.jsonl             # threshold sweep, no LLM calls
uv run rescore.py results/<stamp>-p1-test-full.jsonl         # re-score a stored run with the current seed, no LLM calls
uv run rescore.py results/<stamp>-p1-test-full.jsonl --primary-only   # ... as scored before 005
uv run pytest                                                # scoring and seed-shape tests

cd ../services/chunker                                       # scripts need the keys exported:
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' ../../.env.local | cut -d= -f2-)"
uv run scripts/poison.py                                     # verifier catch rate on wrong claims
uv run scripts/spike_full.py [--perturb]                     # 003 variance / verifier spike
```

Splits: `dev` (prompt tuning, few-shot source) and `test` (report only). Each run writes to `evals/results/` (gitignored): raw JSONL, a `.summary.json`, and a Markdown report with deltas against the previous run with the same prompt, split and mode. Reports that back published numbers are copied to [`evals/reports/`](evals/reports/005/).

**Seed** (`evals/seed/seed_v1.yaml`, 120 items). Each item has an input, expected chunks with regions, forbidden literal translations, expected note kinds, a source, and:

- `accepted:` other valid forms of an expected chunk (a string keeps its regions; `{surface, regions}` sets its own);
- `also_valid:` other valid chunks for the phrase, which count as correct but are not required for recall;
- `checked:` how its answers were checked (`native:<region>`, `reference:<source>`, `author`).

Answers are written before a model sees the item. Later additions are listed in [`seed/KEY_CHANGES.md`](evals/seed/KEY_CHANGES.md). The chunk service's seed index (fast-mode "verified") reads only the primary surfaces.

**Metrics.** Chunk recall (expected chunks found); calque rate (items where a forbidden phrase appears); region precision (region tags on matched chunks that the seed lists); over-tagging (matches on neutral-only forms that carry a country tag); and, in full mode, high-label precision with the seed rule masked, accuracy per confidence bucket, the consistency histogram and verifier agreement. Chunks and alternatives the seed does not list are excluded from region scoring and counted.

## Eval results

Seed v1, 120 items (60 dev, 60 test); runs of 2026-09-27; primary `claude-sonnet-5`, verifier `gpt-5.4-mini`, thresholds T_high 1.0 and T_med 0.6.

**Test split, p1 (default) vs p2:**

| Metric (test, 60 items)              | p1   | p2   |
| ------------------------------------ | ---- | ---- |
| Chunk recall                         | 0.83 | 0.87 |
| Calque rate                          | 0.00 | 0.02 |
| Region precision                     | 0.89 | 0.89 |
| Over-tagging rate                    | 0.05 | 0.07 |
| Chunks: high precision (seed masked) | 0.83 | 0.80 |
| Chunks: high coverage (seed masked)  | 0.72 | 0.79 |
| Alternatives: high precision         | 0.65 | 0.70 |
| Alternatives: high coverage          | 0.41 | 0.39 |

Calibration (chunks, test, p1): `high` 0.83 accurate, `med` 0.38.

**How the answers were checked** (items per tier; an item can have several kinds):

| Tier     | Items | Native | Reference | Author |
| -------- | ----- | ------ | --------- | ------ |
| simple   | 36    | 0      | 6         | 36     |
| regional | 36    | 0      | 13        | 36     |
| advanced | 30    | 0      | 4         | 30     |
| calque   | 18    | 0      | 5         | 18     |

No item has a native-speaker check yet; references are the DLE (cited in the original 30 items) and Spanish Wiktionary regional marks.

### Before and after

**p2 targeted recall, and is not adopted.** On the p1 baseline, recall was the weakest headline metric, and every dev miss broke a rule p1 already states: surfaces returned conjugated (_estoy muy enojado_ for _estar enojado_), or the pattern carrying the meaning was never chunked. p2 adds three things:

- a stricter unconjugated-surface rule, with exceptions for set phrases;
- a coverage rule: the pattern carrying the meaning, and the correct form a note points to, must be chunks;
- a region guardrail: never mix `neutral` with countries, and a form used in three or more countries is `neutral`.

It was iterated three times on dev and run once on test. It raised recall from 0.83 to 0.87, but the calque rate (one item: _factura_ offered as an alternative for "the bill"), over-tagging (+2 items) and chunk high precision got slightly worse. The adoption rule, set before the run, requires no other headline metric to get worse, so p1 stays the default and p2 stays in `prompts/` as a documented experiment. The differences are one to three items each, within the noise of a 60-item test split.

**The evals found a service bug first.** p2's coverage rule seemed to do nothing, because the chunks it asked for were generated and then silently dropped by the validator: 7% of the seed's forms, including _buena suerte_ and regional nouns like _pajita_. Fixed in [bug 003](bugs/003-validator-drops-valid-chunks.md). It took p1's dev recall from 0.85 to 0.92, more than the prompt change did. Validation drops now show in `meta.dropped`.

**Most of 003's precision gap was the answer key.** Re-scoring 003's stored test run with no LLM calls: high-label precision was 0.62 with one answer per chunk, and 1.00 once valid alternatives count (`accepted:`, `also_valid:`). Those alternatives were added after seeing that run's output. The new 90 items were keyed before any model run and give 0.83, a fairer estimate.

Reports: [`evals/reports/005/`](evals/reports/005/). Numbers reproduce from the local disk cache (re-running the commands above serves every item cached, with identical metrics); the cache is gitignored, so a fresh clone regenerates with new LLM calls.

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
| `CHUNKER_SEED_PATH`      | chunker             | `evals/seed/seed_v1.yaml`          | Seed list for "verified" confidence.                                                                              |
| `CHUNKER_CACHE_DIR`      | chunker             | `.cache/chunker` (relative to cwd) | Disk response cache.                                                                                              |
| `CHUNKER_URL`            | web                 | `http://localhost:8000`            | Where the web app's server functions reach the chunk service.                                                     |
| `CHUNKER_TOKEN`          | chunker, web, evals | unset                              | Optional shared secret. When set, `POST /v1/chunk` requires `Authorization: Bearer <token>`.                      |
| `DATABASE_URL`           | web                 | —                                  | Postgres for saved chunks (004). Also read by `drizzle-kit` from `apps/web` or the repo root's `.env.local`.      |

## Full stack via Docker

Compose reads keys from your shell or a root `.env`, not `.env.local`, so export them first:

```bash
export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_KEY=' .env.local | cut -d= -f2-)"
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)"
docker compose up --build
```

Starts web (`:3000`), the chunk service (`:8000`, health at `/v1/health`), and Postgres 16 (`:5432`, user/password/db `trozo`). A one-shot `migrate` service applies the Drizzle migrations before web starts, so an empty database needs no manual step. Images do not hot-reload; use `pnpm dev:all` for development.

## Database

Drizzle config lives in `apps/web`. With `DATABASE_URL` set (see docker-compose for the local URL):

```bash
pnpm --filter web db:generate   # generate migrations from schema
pnpm --filter web db:migrate    # apply migrations
pnpm --filter web db:studio     # inspect
```

For `pnpm dev:all`, run Postgres (e.g. `docker compose up -d postgres`), point `DATABASE_URL` in `.env.local` at it (`postgres://trozo:trozo@localhost:5432/trozo`) and run `db:migrate` once.

`saved_chunks` (004) holds saved chunks and regional variants, one row per Anki card, deduplicated on surface + Spanish example (`UNIQUE NULLS NOT DISTINCT`, so Postgres 15+). The response cache is a disk cache inside the chunk service, not a database table.

The repository tests in `apps/web/src/server/saved.server.test.ts` run against a real Postgres when `TEST_DATABASE_URL` is set (each run migrates and drops a throwaway schema) and are skipped otherwise:

```bash
TEST_DATABASE_URL=postgres://trozo:trozo@localhost:5432/trozo pnpm --filter web test
```

## Export to Anki

Save chunks or single regional variants from the cards, then export from `/saved` (the current region/tag filters apply) or with "Export to Anki" in the header (Basic, everything). Files are UTF-8 with a BOM.

| Button       | Route                      | Anki note type | Columns                                                                                               |
| ------------ | -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Anki (Basic) | `/api/export?format=csv`   | Basic          | `Front` (English example), `Back` (Spanish example, chunk in bold, pattern and regions), `Tags`       |
| Anki (Cloze) | `/api/export?format=cloze` | Cloze          | `Text` (Spanish example with `{{c1::chunk}}`), `Extra` (English example, pattern and regions), `Tags` |
| TXT          | `/api/export?format=txt`   | —              | One line per item: `pattern — example_es — regions`                                                   |

In Anki (2.1.54+): File → Import and pick the file. The CSVs start with Anki file headers (`#separator:Comma`, `#html:true`, `#notetype:Basic` or `Cloze`, `#columns:…`, `#tags column:3`), so the separator, HTML, note type and Tags column are preset; choose a deck and import. If your note types are renamed, pick the right one in the dialog. Tags are `trozo`, `region::<R>` and `register::<register>`, so Anki shows them as a hierarchy. In a spreadsheet the `#` lines show up as the first rows.
