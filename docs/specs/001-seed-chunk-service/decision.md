# Decision Record: Seed v0 + Chunk Service

| Field   | Value                |
| ------- | -------------------- |
| id      | 001                  |
| status  | implemented          |
| created | 2026-09-23           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

First feature on the 000 skeleton, delivering trozo's core: a real `POST /v1/chunk` plus the eval harness that makes its quality measurable. The spec was Medium confidence with a mandated validation gate — an 8-item end-to-end spike before authoring the full seed — and the spike turned out to be the defining event of the implementation: it exposed four real matcher defects that unit tests with a fake LLM could never have caught. One API constraint discovered during planning also shaped the work: Claude Sonnet 5 rejects non-default sampling parameters, so the design doc's "temperature 0.3" was not implementable. Work was done on `feature/001-seed-chunk-service` and merged via PR #1.

## Decision <!-- required -->

Build the chunk service as a chain of pure functions around one structured-output LLM call: normalize → disk cache → generate (Claude Sonnet 5 via `messages.parse` with the Pydantic schema, effort-based depth control, no sampling params) → validate/repair with one error-appending retry → seed match → fast confidence → assemble. The model produces an `LLMDraft` (translation, chunks, notes with chunk indexes); confidence and example highlights are always computed by the service. The eval harness is a first-class deliverable: a 30-item seed (15 dev / 15 test) and a runner that prints chunk recall and calque rate, which gated the implementation itself — final metrics: **dev recall 0.98, test recall 1.00, calque rate 0.00 on both splits**.

---

## Alternatives Considered <!-- required -->

### Structured output mechanism

**Option A: Tool use with `strict: true`** — force a tool call whose input is the draft schema.

- Pros: works on older SDKs.
- Cons: tool-use plumbing for what is really a response format; extraction from `tool_use` blocks.

**Option B: `output_config.format` via `messages.parse()`** — canonical structured outputs with the Pydantic model.

- Pros: schema-enforced server-side, `parsed_output` returns the validated model, SDK strips unsupported constraints; no tool plumbing.
- Cons: requires a current SDK (verified: anthropic 1.8.0 has it).

**Chosen:** B — the canonical path, and the installed SDK supports it.

### Note-to-chunk linking (`applies_to`)

**Option A: Service-side heuristic** — lemma overlap between a note's `avoid` text and chunk surfaces.

- Pros: model schema stays minimal.
- Cons: fails the common cases (e.g. "Estoy muy excitado" shares no lemma with "tener ganas de"), which are exactly the links the mockup's "→ card 01" UX needs.

**Option B: Model emits `chunk_indexes`** — 0-based indexes in the draft, converted to `ch_N` ids (bounds-checked) by the service.

- Pros: the model knows which chunk a trap relates to; trivially reliable.
- Cons: slightly larger draft schema.

**Chosen:** B. Verified live: notes link correctly (false_friend → ch_1, preposition → ch_2 on the mockup phrase).

### Matcher strictness (spike-driven)

**Option A: Pure spaCy lemma equality** — the spec's starting point.

- Pros: principled, no heuristics.
- Cons: the spike showed `es_core_news_sm` mis-lemmatizes real cases — `extraño` read as the adjective, clitic verbs (`postularme`, `pasarlo`, `darse`) expanded into phantom pronoun lemmas, `al`/`del` contractions unmatched — causing validation to drop _correct_ chunks (two items returned zero chunks).

**Option B: Lemma equality + lenient fallbacks** — verb-stem prefix match, clitic-suffix stripping at surface-cleaning time, contraction awareness, fuzzy seed containment for optional words.

- Pros: recovered every spike false-negative; each fallback carries a regression test naming the spike finding.
- Cons: leniency admits theoretical false positives (stem prefixes); near-miss tuning deferred to 005.

**Chosen:** B — dev recall went 0.60 → 0.98 across spike iterations with calque rate staying 0.00.

### Retry policy

Only one approach was seriously considered: retry once, with validation errors appended, **only when repair leaves zero chunks from a non-empty draft**. Retrying on any dropped chunk would double LLM cost for marginal gain; never retrying returns empty results for recoverable failures. The spec's "one retry on failure" left the trigger unspecified; this is the implemented interpretation.

---

## Tradeoffs <!-- required -->

- **Effort-based depth (`medium`) instead of temperature** accepts the model's default variance; there is no low-temperature determinism lever on Sonnet 5. Caching compensates for repeatability within a prompt version.
- **Lenient matching** optimizes for recall of correct chunks over strictness; the cost is possible false-accepts at validation, monitored via the eval suite rather than prevented structurally.
- **The eval runner's matcher is a lighter, non-lemmatizing cousin** of the service's (token subsequence over citation forms). Cheap and dependency-free for `evals/`, but recall can disagree with the service matcher at the margins — parity is 005's matcher-tuning work.
- **Seed regions live as a flat surface→regions index**; per-item region _precision_ scoring (over-tagging metric) is deferred to 005 as specced.
- **Disk cache keys include prompt _version_, not prompt _content_** — editing `p1.md` in place during development required manual eviction. Acceptable pre-release; post-release prompt edits must bump the version.

---

### Spec Divergence <!-- optional -->

All 13 acceptance criteria are met. Divergences from the spec/design-doc prose:

| Spec Said                                         | What Was Built                                                                       | Reason                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Generation at temperature 0.3 (design doc)        | No sampling params; `output_config.effort` (default `medium`) controls depth         | Claude Sonnet 5 returns 400 on non-default `temperature`/`top_p`/`top_k`               |
| Notes' `applies_to` linked by the service         | Model emits `chunk_indexes` in the draft; service converts to bounds-checked ids     | Heuristic linking fails the common cases; model indexes are reliable (verified live)   |
| Seed match: lemma equality on normalized key      | Equality plus containment fallback (`tener (muchas) ganas de` hits `tener ganas de`) | Spike finding: optional words break exact keys                                         |
| ~30% simple / 30% regional / 25% adv / 15% calque | 9 / 9 / 7 / 5 (30% / 30% / 23% / 17%)                                                | Rounding on 30 items; calque slightly overweighted as the highest-signal tier          |
| "One retry with validation errors appended"       | Retry only when repair leaves zero chunks from a non-empty draft                     | Spec left the trigger unspecified; retrying on any drop doubles cost for marginal gain |

---

## Spec Gaps Exposed <!-- optional -->

- **003's self-consistency design assumes temperature sampling** (N=5 at temp 0.8, per the design doc). Sonnet 5 has no temperature; 003's spec must choose a different variance source (prompt nonce variation, or rely on default sampling variance). This is the most consequential gap.
- **Recall penalizes valid variants**: `qué padre` vs expected `qué chido` (both valid MX) is the single dev miss. The seed format has no "any-of" expectation; 005's native-check pass should either add variant lists or accept this as measurement noise.
- **Note-kind boundaries are fuzzy**: the model tags "aplicar a un trabajo" as `false_friend` where the design doc's tier called it a calque. Seed expectations were adjusted; a kind-taxonomy note may be worth adding to the prompt in a future version.
- **Prompt-content changes don't invalidate the cache** (version-keyed only). Fine pre-release; worth a rule — bump `pN` on any prompt edit once real users exist.

---

## Test Evidence <!-- required -->

Unit suites on merged main (2026-09-23):

```
services/chunker:  40 passed in 0.76s
packages/schema test: Done          (tsc --noEmit on generated types + fixture)
apps/web test:  Tests  1 passed (1)
```

Eval runs against the live service (prompt p1, claude-sonnet-5), actual runner output:

```
$ uv run run.py --prompt p1 --model primary --split dev
items: 15  chunk recall: 0.98  calque rate: 0.00
results: evals/results/20260923T213743Z-p1-dev.jsonl

$ uv run run.py --prompt p1 --model primary --split test
items: 15  chunk recall: 1.00  calque rate: 0.00
results: evals/results/20260923T214025Z-p1-test.jsonl
```

Spike progression (8 items, same seed subset): recall 0.60 → 0.94 → 1.00, calque 0.00 → 0.12 → 0.00 across the three matcher/prompt iterations described above.

Cache behavior, live: repeat request returned `"cached": true, "latency_ms": 0` with no LLM call (single entry in `fake`-free server log). Docker: `docker compose build chunker` succeeded with the spaCy model wheel; `curl /v1/meta` against the container returned the regions/note-kinds/prompt-version payload.
