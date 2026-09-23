# Spec: Seed v0 + Chunk Service

| Field   | Value      |
| ------- | ---------- |
| id      | 001        |
| status  | approved   |
| created | 2026-09-23 |

---

## Why <!-- required -->

Everything else in trozo depends on a chunk service whose quality can be measured — the evals must exist alongside the first endpoint, not after the UI. This milestone delivers the working core (`POST /v1/chunk` with real LLM generation) together with the first 30 seed items and an eval runner that prints chunk recall and calque rate, so every later prompt or model change is measurable from day one.

### Consumer Impact <!-- required -->

Direct consumer: the developer and the eval harness — 001 has no UI. The eval runner becomes the first real client of the service, calling the same endpoint users eventually will. Downstream, every trozo user benefits: the UI in 002 renders whatever this service returns, and its quality bar is set here.

### Roadmap Fit <!-- required -->

First feature after the 000 skeleton; blocks 002 (UI needs the endpoint and the generated TS types), 003 (full confidence extends this pipeline), and 005 (seed growth builds on this seed format and runner). Depends only on 000.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

- [ ] `POST /v1/chunk` accepts the design-doc request shape (`text` 1–200 chars, `preferred_region` in {neutral, ES, MX, AR, CO}, `confidence_mode: fast`) and returns schema-valid JSON: `translation`, 1–5 chunks with pattern/slots/surface/gloss/register/regions/example, notes with `kind` and `applies_to`, and `meta` with `prompt_version` and `model`.
- [ ] Generation runs on Claude Sonnet 5 behind an `LLMClient` interface that can be swapped per run (model id passed through to `meta.model`).
- [ ] Validation/repair is enforced: examples contain their chunk at lemma level (spaCy `es_core_news_sm`), region tags outside the enum are dropped, duplicate chunks removed, one retry with validation errors appended on schema failure.
- [ ] Every chunk's surface appears (lemma-level) in `translation`; violating chunks are dropped or the translation regenerated.
- [ ] `fast` confidence works: seed match on chunk+region → `high` ("verified"); no match → `unrated`.
- [ ] Responses are cached on local disk keyed by sha256(normalized input, region, prompt_version, model); a repeat request makes no LLM call.
- [ ] `GET /v1/meta` returns supported regions, note kinds, and current prompt version; errors follow the design doc (`422` invalid input, `502` LLM failure after retry).
- [ ] Seed v0 exists: 30 YAML items across the four tiers (~30% simple, ~30% regional, ~25% advanced, ~15% calque traps), each with `expected_chunks`, `forbidden`, `expected_note_kinds`, `source`, and a `dev`/`test` split; few-shot examples come only from `dev`.
- [ ] `evals/run.py --prompt p1 --model primary --split dev|test` calls the running service over HTTP, prints chunk recall and calque rate, and writes JSONL raw results.
- [ ] The prompt lives at `services/chunker/prompts/p1.md` and its version is logged in every response and eval line.
- [ ] `packages/schema` contains the JSON Schema exported from the Pydantic models and TS types generated from it, with a script to regenerate both.
- [ ] All pipeline steps are pure functions with pytest coverage (LLM faked); the full suite passes.

### Non-Goals <!-- required -->

- Full confidence: self-consistency sampling, verifier model, threshold tuning — feature 003. In 001, no seed match simply means `unrated`.
- Translator UI or any web-app change — feature 002.
- Saving, Postgres tables, export — feature 004. The disk cache is explicitly not the `chunk_cache` Postgres table.
- Seed growth past 30, native-speaker checks, Markdown eval reports with deltas — feature 005.
- CI (eval GitHub Action), deployment beyond the existing docker-compose.
- LLM-as-judge metrics.

### Open Questions <!-- optional -->

- Bare-fragment example mirroring (input like "to look forward to"): deferred to prompt iteration — the prompt starts with "mirror the input's person and tense where possible" and the behavior gets tuned against seed items, not decided here.

---

## How <!-- required -->

### Approach <!-- required -->

All service code in `services/chunker`, evals in `evals/`, generated contract in `packages/schema`.

1. **Contract**: Pydantic v2 models mirroring the design doc's request/response (ChunkRequest, ChunkResponse, Chunk, Example, Alternative, Note, Confidence, Meta). These are the single source of truth: FastAPI response model, LLM structured-output schema, and codegen input.
2. **LLMClient**: minimal interface (`generate_structured(system, messages, schema) -> dict`), Anthropic implementation using Claude Sonnet 5 with tool-use/structured output, model id from env (`CHUNKER_PRIMARY_MODEL`, default `claude-sonnet-5`). A fake implementation backs tests.
3. **Pipeline** (pure functions, composed in the route handler): `normalize` (trim, collapse whitespace, length cap, empty/non-English detection) → `cache_lookup` (sha256 key, JSON files under a cache dir) → `generate` (prompt p1, temp 0.3) → `validate_repair` (schema check; lemma-level example-contains-chunk via spaCy; enum/dup enforcement; one retry with errors appended) → `seed_match` (normalize: lowercase, strip accents for matching, lemmatize head verb; look up chunk+region in seed list) → `fast_confidence` (seed hit → high/"verified", miss → unrated) → assemble response + write cache.
4. **Prompt p1** (`prompts/p1.md`): defines a chunk (multi-word unit stored as one piece; not word-by-word translation); instructs the private literal-attempt step to surface calques into `notes`; mirror person/tense where possible; region tags only when characteristic, `neutral` default, inventing a regionalism is worse than omitting; 4–6 few-shot examples drawn from the seed `dev` split.
5. **Seed v0** (`evals/seed/seed_v0.yaml`): 30 items in the design-doc YAML format across the four tiers, regions limited to {neutral, ES, MX, AR, CO}, each tagged with a source; split field `dev`/`test`.
6. **Eval runner** (`evals/run.py`): args `--prompt --model --split --base-url`; calls `POST /v1/chunk` per item; computes chunk recall (normalized match against `expected_chunks`) and calque rate (`forbidden` phrase appears as chunk or in examples); prints a summary table; writes JSONL of raw responses + per-item scores.
7. **Schema codegen** (`packages/schema`): script in the chunker exports JSON Schema from the Pydantic models to `packages/schema/chunk.schema.json`; a pnpm script generates TS types (e.g. via `json-schema-to-typescript`) to `packages/schema/src/index.ts`.
8. **Validation-first sequencing**: before authoring all 30 items, run the pipeline end-to-end on ~8 items (2 per tier) and check schema pass rate and lemma-match reliability; adjust prompt or matcher first if either is poor.

### Confidence <!-- required -->

**Level:** Medium

**Rationale:** The pipeline, contract, and metrics are specified in unusual detail by the design doc, and the 000 skeleton removes all infrastructure risk. Two things are unproven: whether Claude Sonnet 5's structured output passes this fairly deep schema on the first try at a usable rate, and whether spaCy `es_core_news_sm` lemma matching reliably locates chunks inside examples (multi-word patterns with optional parts are the hard case).

**Validate before proceeding:** Run the end-to-end spike of step 8 (≈8 seed items) and inspect: schema pass rate before repair, lemma-match false negatives, and whether calque notes actually appear. Only then author the remaining seed items and finalize the runner output.

### Key Decisions <!-- optional -->

- **Claude Sonnet 5 as primary** (human choice): strong structured output and Spanish at mid-tier cost; keeps a non-Anthropic vendor free for the 003 verifier.
- **Local disk cache, not Postgres** (human choice): evals need cheap re-runs now; the service stays DB-free and the architecture's Postgres cache decision is untouched until 004.
- **Schema codegen in 001, not 002** (human choice): 002 starts with a ready, generated contract.
- **Seed match tolerance**: matching normalizes accents and lemmatizes only the head verb; optional parenthesized words are stripped. Near-miss logging included so the matcher can be tuned in 005.

### Testing Approach <!-- required -->

Per OVERVIEW's testing suite:

- **pytest (chunker)**: unit tests per pure pipeline step with the fake LLMClient — normalize edge cases (empty, >200 chars, whitespace), cache key stability and hit/miss, validate_repair (chunk-not-in-example dropped, bad region dropped, duplicate removal, retry path), seed_match (accent/lemma normalization, region tagging), fast confidence rules; route test for `POST /v1/chunk` happy path and `422`/`502` via TestClient.
- **Eval suite as product bar**: `run.py --split dev` against the live service is the acceptance check that recall and calque rate are computed and printed; exact metric targets are not gated in 001 (thresholds are 005's concern), but the numbers must be real.
- **Vitest (packages/schema)**: one test asserting the generated TS types compile and match a sample response fixture (`tsc` on the package as part of `pnpm test`).
- Spike results (step 8) recorded in the decision record as evidence.
