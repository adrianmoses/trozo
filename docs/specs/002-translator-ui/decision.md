# Decision Record: Translator UI

| Field   | Value                |
| ------- | -------------------- |
| id      | 002                  |
| status  | implemented          |
| created | 2026-09-25           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

First human-facing surface on top of the 001 service. The spec was approved on 2026-09-24 at Medium confidence with two validation gates (a data-flow spike under SSR and a test-runner check), and the plan was approved the same day. Two decisions were taken during spec review rather than in the spec's first draft: the app is dark only (the human asked why a light palette was needed; nothing in the product docs wanted one), and the spec does not get its own PR — its commit rides on `feature/002-translator-ui` with the implementation.

Beyond the spec, five things shaped the work:

- **Both gates passed first and settled the data flow.** The spike showed server rendering returns the skeleton in ~13 ms without touching the LLM, the route loader does not re-fire on client navigation with `staleTime: Infinity`, the cookie round-trips, back/forward render from the query cache with no service call, and 422 and network failures both arrive as data. Nothing in steps 8–10 had to change afterwards.
- **The plan's verification pass found two wiring gaps** the spec had not named: the web app had no dependency on `@trozo/schema`, and the Dockerfile copied only that package's manifest. Both were fixed before any component code.
- **The shadcn CLI output needed hand repair.** It wrote `import { cn } from "cn"` instead of the configured alias and pulled in `next-themes` for its toaster. The alias was fixed, the toaster pinned to dark, and the dependency removed.
- **Testing Library needed two shims.** Its auto-cleanup does not run without Vitest globals (tests bled DOM into each other until `afterEach(cleanup)` was added), and `user-event` installs its own clipboard stub on setup, so copy tests spy on that stub rather than defining one.
- **Gathering evidence for this record exposed a real gap.** Cache hits are served as raw dicts, so the 30 seed phrases cached before the change carried no `translation_highlight` at all: 0 of 20 chunks in the dev run. Acceptance criterion 15 ("every chunk carries the field") was therefore unmet for any phrase cached before 002. The field is now backfilled on read and persisted; the re-run shows 44 of 44 chunks with a non-null range and unchanged metrics.

Work was done on `feature/002-translator-ui`; the branch is not yet merged.

## Decision <!-- required -->

Build the translator as a search-param-driven route. The URL (`/?q=…&region=…`) is the single source of truth: a TanStack Query keyed by `(region, q)` calls one POST server function, which proxies `POST /v1/chunk` in fast mode and returns a discriminated `{ ok, data | error }` result instead of throwing. The route loader only reads the region cookie (`staleTime: Infinity`), so server rendering never waits on the LLM; the skeleton renders and the client fetches. Components follow the design doc's anatomy (input bar, translation line with every chunk underlined, watch-out box whose "→ card NN" links flash the target card, cards with slot and register pills, underlined example, "avoids:" line, collapsible variants, split Copy). The whole app wears one dark palette read from the mockup, with shadcn's tokens remapped onto it so primitives match. The service gained an opt-in `CHUNKER_TOKEN` bearer guard on the chunk endpoint and a per-chunk `translation_highlight` computed with the existing lemma-aware `highlight_range`, backfilled onto old cache entries on read. Evidence: 47 pytest, 57 Vitest, type-check, lint and Prettier clean, web and Docker builds green, eval recall 0.98 (dev) and 1.00 (test) with calque rate 0.00, unchanged from 001.

---

## Alternatives Considered <!-- required -->

### Where the chunk request runs

**Option A: Route loader.** Fetch in `loader`, render the result server-side.

- Pros: results in the initial HTML; no client fetch.
- Cons: server rendering blocks for the length of the LLM call (≈5 s); the design doc's skeleton state is impossible.

**Option B: `useQuery` in the component, loader reads only the cookie.**

- Pros: SSR returns immediately with the skeleton (measured 13 ms warm); back/forward hit the query cache; matches the design doc's states.
- Cons: a shared link shows a skeleton before content; results are never in the HTML (irrelevant for a single-user tool).

**Chosen:** B, confirmed by the spike before any component was written.

### Error transport across the server-function boundary

**Option A: Throw from the handler.** The client sees `error.message`.

- Pros: idiomatic; TanStack Query's `isError` path.
- Cons: status and code do not reliably survive serialization; the UI would parse messages to branch.

**Option B: Return `{ ok: false, error: { status, code, message } }` as data.**

- Pros: exact status and code reach the UI; one place to map them to wording (`describeError`); errors are cacheable and retryable like data.
- Cons: every consumer must branch on `ok`; the query never enters `isError` for service failures (reserved for validator/transport errors).

**Chosen:** B.

### Remembering the region

**Option A: `localStorage`, applied after hydration.**

- Pros: no server involvement.
- Cons: first paint at `neutral`, then a flip: a visible flash and a hydration risk.

**Option B: Cookie set by the server function, read by the route loader.**

- Pros: the initial selector value is identical on server and client; nothing flashes.
- Cons: a loader that could re-run on every search change; mitigated with route `staleTime: Infinity`, which the spike verified.

**Chosen:** B.

### Region in the URL

**Option A: `stripSearchParams` for `region=neutral`** (the spec's Approach prose).

- Pros: shorter URLs.
- Cons: a shared link generated at `neutral` re-runs at the recipient's cookie region.

**Option B: Region always in the URL after a submit.**

- Pros: shared links reproduce the generating region exactly; matches acceptance criterion 2 literally.
- Cons: `region=neutral` is visible.

**Chosen:** B.

### Old cache entries and the new field

**Option A: Serve as-is** (the spec's testing prose: "a cached payload without the field still serves").

- Pros: no cache mutation.
- Cons: every phrase cached before 002 lacks the field; the UI's fallback search cannot match conjugated forms ("Tengo" vs `tener`), so underlines silently disappear.

**Option B: Evict the cache or bump the prompt version.**

- Pros: clean.
- Cons: throws away 30 seed responses and, post-release, real users' cached results; the version bump would misreport an unchanged prompt.

**Option C: Backfill on read and persist.**

- Pros: self-healing; one lemma pass and one disk write per old entry, ever; the acceptance criterion holds universally.
- Cons: a cache hit can mutate a cache file; the same treatment will be needed for any future additive field.

**Chosen:** C.

### Test environment for the web suite

**Option A: `environmentMatchGlobs` for `.test.tsx`** (the spec's wording).

- Cons: deprecated in the installed Vitest 3.2.

**Option B: Per-file `// @vitest-environment jsdom` docblocks, or `projects`.**

- Cons: easy to forget per file; `projects` is more config than a five-file suite needs.

**Option C: `environment: 'jsdom'` globally.**

- Pros: one line; pure tests still pass under jsdom.
- Cons: pure tests pay jsdom start-up (the suite runs in ~5 s, most of it environment set-up).

**Chosen:** C.

### What "chunk only" copies

Only two candidates: the `surface` (the concrete form in the example) or the `pattern` (with optional words in parentheses). The pattern was chosen because it is the form a learner stores and the TXT line format already uses it; chunk + example is `pattern — example_es`.

---

## Tradeoffs <!-- required -->

- **No results in server-rendered HTML.** Optimises for a responsive UI and cheap back/forward over first-paint completeness. Fine for a single-user tool; would matter for public share pages.
- **Cookie default is read once per page load.** With `staleTime: Infinity` a changed region reaches the selector only on a full load, but after any submit the URL carries the region, so the default is only ever used on the first visit.
- **Region always in the URL** trades a slightly longer URL for exact shared links.
- **Errors as data** trade TanStack Query's built-in error path for exact status codes and one wording function.
- **Backfill on read** trades an occasional cache-file rewrite for universal presence of the field; acceptable pre-release, but a `schema_version` in the cache key would be the principled fix once more fields follow.
- **Dark only** trades system-theme respect for one visual identity and no invented light palette.
- **Hand-written validators** trade schema-derived validation for zero dependencies; the region list is guarded by a compile-time exhaustiveness check against the contract's `Region` union.
- **Opt-in token** enforces nothing until `CHUNKER_TOKEN` is set; compose passes an empty default so local demos need no configuration.
- **Global jsdom** trades a few seconds of test start-up for one line of config.

---

### Spec Divergence <!-- optional -->

All 16 acceptance criteria are met. Divergences from the spec's prose:

| Spec Said                                                   | What Was Built                                                                                                           | Reason                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `stripSearchParams` keeps `region=neutral` out of the URL   | Region always in the URL after a submit                                                                                  | Shared links must re-run at the generating region, not the recipient's cookie region                 |
| "A cached payload without the field still serves"           | Old cache entries are backfilled with `translation_highlight` on read and persisted                                      | Serving them unchanged left criterion 15 unmet for every pre-002 phrase (0/20 chunks in the dev run) |
| `environment: 'jsdom'` for `.test.tsx`                      | jsdom globally                                                                                                           | `environmentMatchGlobs` is deprecated in Vitest 3.2; per-file docblocks are easy to forget           |
| Server function named `chunk`                               | `chunkFn`                                                                                                                | Keeps `chunk` free as the ubiquitous local name                                                      |
| Validators inside `chunk.functions.ts` and the route file   | Pure modules `lib/chunk-input.ts` and `lib/search.ts`, imported by the function and the route                            | Testable without importing TanStack Start server modules under jsdom                                 |
| shadcn primitives "added through the configured CLI"        | Added by the CLI, then hand-fixed: `cn` alias repaired, toaster pinned to dark, `next-themes` removed                    | CLI alias-resolution bug; dark-only app needs no theme provider                                      |
| Manual smoke: "a 201-character input (422 inline)"          | 422 exercised with non-English text; 201 characters are blocked client-side (unit-tested) and capped by `validateSearch` | The service never sees 201 characters from the UI, so that path cannot produce a 422 through the app |
| Manual smoke: "phone width in devtools"                     | Structural check only (single-column grid under the medium breakpoint, fluid page wrap, no fixed widths)                 | The Chrome extension could not resize the window; the stacked layout was not screenshotted           |
| Copy formats unspecified beyond "chunk" / "chunk + example" | "chunk" copies the `pattern`                                                                                             | Matches the TXT line format and the form a learner stores                                            |

---

## Spec Gaps Exposed <!-- optional -->

- **Additive contract fields versus the raw cache.** The spec assumed old cache entries could simply lack a new field. Any future additive field (003's consistency and verifier signals are next) needs either a read-time backfill or a cache key that includes a schema version. Candidate ARCHITECTURE note or a small 003 task.
- **The demo phrase is `unrated`.** The mockup sentence ("I'm really excited to go to the beach this weekend.") at `neutral` returns three chunks with no seed match, so the demo shows no "verified" label. 005's seed growth should make sure the demo phrases are seed-verified, or the confidence UI will look inert until 003 lands.
- **003's spinner state has a hook but no trigger.** `ConfidenceLabel` renders `unrated` statically and exposes `data-confidence`; 003 must add both the background `full` call and the spinner rendering.
- **The token is opt-in and unset by default,** so nothing enforces it until deployment sets `CHUNKER_TOKEN`. Deployment is not on the roadmap.
- **`packages/schema/README.md` still describes the package as a stub** (predates 001). Doc-only; worth fixing whenever that folder is next touched.

---

## Test Evidence <!-- required -->

Unit suites and static checks on the merged commit (2026-09-25, local):

```
== pytest (services/chunker) ==
...............................................                          [100%]
47 passed in 0.94s

== vitest (apps/web) ==
 ✓ src/lib/labels.test.ts (4 tests) 8ms
 ✓ src/lib/highlight.test.ts (8 tests) 9ms
 ✓ src/lib/utils.test.ts (1 test) 13ms
 ✓ src/lib/search.test.ts (3 tests) 7ms
 ✓ src/lib/chunk-input.test.ts (4 tests) 9ms
 ✓ src/lib/copy.test.ts (4 tests) 7ms
 ✓ src/lib/chunker.server.test.ts (9 tests) 16ms
 ✓ src/test/runner.test.tsx (1 test) 70ms
 ✓ src/components/translator/WatchOutBox.test.tsx (3 tests) 445ms
 ✓ src/components/translator/InputBar.test.tsx (4 tests) 560ms
 ✓ src/components/translator/CopyButton.test.tsx (4 tests) 426ms
 ✓ src/components/translator/ChunkCard.test.tsx (6 tests) 335ms
 ✓ src/components/translator/TranslatorView.test.tsx (6 tests) 349ms
 Test Files  13 passed (13)
      Tests  57 passed (57)

== schema (tsc --noEmit on generated types + fixture) ==
> tsc --noEmit
exit=0

== tsc (apps/web) ==      clean
== eslint (apps/web) ==   clean
== prettier (repo) ==     All matched files use Prettier code style!
```

Builds: `pnpm --filter web build` completed (exit code 0); `docker compose build web` completed (exit code 0) with the new `COPY packages/schema` step.

Eval runs against the live service after the backfill (prompt p1, claude-sonnet-5, all items served from cache):

```
$ uv run run.py --prompt p1 --model primary --split dev
items: 15  chunk recall: 0.98  calque rate: 0.00
results: evals/results/20260924T224545Z-p1-dev.jsonl

$ uv run run.py --prompt p1 --model primary --split test
items: 15  chunk recall: 1.00  calque rate: 0.00
results: evals/results/20260924T224547Z-p1-test.jsonl

20260924T224545Z-p1-dev.jsonl:  items=15 cached=15/15 chunks=20 with_translation_highlight_key=20 non_null=20
20260924T224547Z-p1-test.jsonl: items=15 cached=15/15 chunks=24 with_translation_highlight_key=24 non_null=24
```

Before the backfill the same dev run reported `chunks_with_translation_highlight=0/20`.

Token guard on a second live instance (`CHUNKER_TOKEN=s3cret`, port 8001):

```
--- no header ---
{"error":{"code":"unauthorized","message":"missing or invalid service token"}} HTTP 401
--- wrong token ---
HTTP 401
--- correct token (cached phrase) ---
HTTP 200 cached=True chunks=['extrañar']
--- meta/health open ---
meta HTTP 200
--- eval dev split WITH token via --token ---
items: 15  chunk recall: 0.98  calque rate: 0.00
--- eval dev split WITHOUT token (expect failures) ---
items: 15  chunk recall: 0.00  calque rate: 1.00
```

Gate 1, data-flow spike (dev server, throwaway route, since deleted):

```
--- SSR /spike?q=I miss you&region=MX (1st, cold) ---
HTTP 200 in 0.068866s
--- SSR same URL (2nd, warm) ---
HTTP 200 in 0.013193s
   1 defaultRegion=<!-- -->neutral
   1 SKELETON loading
--- SSR /spike with Cookie trozo_region=AR / none / bogus ---
defaultRegion=<!-- -->AR
defaultRegion=<!-- -->neutral
defaultRegion=<!-- -->neutral
chunker POST /v1/chunk lines after: 0
```

In the browser: one `POST /_serverFn/…chunkFn…` per new phrase; `history.back()`/`forward()` re-rendered earlier results with no new request and no new chunker log line; the loader logged only server runs (never a client re-run); "ñññ ááá" surfaced `ERROR 422 invalid_input: input does not look like English text`; with the chunker stopped, `ERROR 0 network: fetch failed`. Console filtered for `hydrat|mismatch|Warning|Uncaught|TypeError`: empty.

Real route, manual smoke: the mockup phrase rendered the translation with three underlined chunks, a watch-out box with two traps and working "→ card" links, three cards with variants expanding to `neutral | me emociona mucho + inf. | unrated` and `ES | me hace mucha ilusión + inf. | unrated`; "Madrid" at ES rendered `→Madrid.` with 0 cards and "Nothing worth chunking here."; with the service stopped, "Where is the train station" showed `Couldn't reach the chunk service (fetch failed).` with Retry; after restarting the service, Retry rendered `→¿Dónde está la estación de tren?` with 2 cards; a real click on a card's Copy button showed the "Copied chunk" toast.

Palette contrast (WCAG, computed):

```
ink on canvas                            14.83:1  AA
ink on surface                           13.48:1  AA
ink-muted on surface                      6.09:1  AA
ink-muted on surface-2 (pills)            6.51:1  AA
ink-faint on surface                      4.86:1  AA
ink-faint on canvas                       5.35:1  AA
brand-text on brand-soft (watch-out)      5.87:1  AA
brand-text on surface                     6.01:1  AA
brand-ink on brand (button)               4.68:1  AA   (brand darkened from #c94b26 to #c4461f)
ink on brand-soft                        13.16:1  AA
```
