# Spec: Translator UI

| Field   | Value      |
| ------- | ---------- |
| id      | 002        |
| status  | approved   |
| created | 2026-09-24 |

---

## Why <!-- required -->

The chunk service works and its quality is measured (001 closed at dev recall 0.98 and calque rate 0.00), but no person can use it. 002 is the first surface that delivers trozo's job-to-be-done to a human: type an English phrase, get the full translation, the traps, and the reusable chunk cards with examples, regional variants and seed-derived confidence, then copy what is useful. It also turns the design doc's mockup into the app's actual look, so every later feature (full confidence, saving) lands in a finished shell instead of the placeholder home page.

### Consumer Impact <!-- required -->

- **The author, as single user** (OVERVIEW's primary consumer): gets the translator at `/`, with URLs that carry the phrase and region so results are shareable and back-button friendly.
- **Portfolio reviewers**: the UI is what they open first; the eval harness stays their real artifact, and nothing in 002 changes generation, so 001's metrics stand.
- **Integration points**: web server functions call `POST /v1/chunk` in fast mode. Two additive service changes ride along: an opt-in service token, and a per-chunk `translation_highlight` range. The eval CLI keeps calling the same endpoint and learns to send the token.

### Roadmap Fit <!-- required -->

Depends on 001 (endpoint, generated TS types, fast confidence). Blocks 003, which patches the query cache this feature creates and turns the static `unrated` state into a spinner-then-label upgrade, and 004, whose Save button, "Saved · n" and "Export to Anki" slot into the cards and header built here. 005 is independent of 002.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Written as the user at `/`:

- [ ] I can type a phrase of 1–200 characters in an input that grows into a textarea, see a character counter, choose a region (neutral, ES, MX, AR, CO) in the bar, and submit with Enter or "Chunk it". Shift+Enter inserts a newline. Empty or over-long input cannot be submitted.
- [ ] Submitting puts `?q=…&region=…` in the URL. Opening that URL shows the same result; back and forward move between earlier results instantly without a new service call. The region I last used is preselected on my next visit even when the URL has none.
- [ ] While a result loads I see a skeleton for the translation line and three cards. Server rendering never waits for the LLM call.
- [ ] The full translation appears in italics under the input, with every chunk's surface underlined in it, and a copy button on hover.
- [ ] When the response has notes, a "Watch out · n traps in this phrase" box lists each one: the phrase to avoid struck through (with "Avoid:" as screen-reader text), a kind label (False friend, Calque, Preposition, Ser/estar, Subjunctive trigger, Gender/article, Register, Other), a one-line reason, and a "→ card NN" link per linked chunk that scrolls to that card and flashes it. No box when there are no notes.
- [ ] Each chunk is a card: two-digit number, pattern in bold serif, slot pills, a register pill when register is not neutral, gloss, the example sentence with the chunk underlined, and a confidence element made of a dot plus a text label. Seed-verified chunks read "verified"; unmatched ones read "unrated" in a neutral style with no spinner.
- [ ] A card that a note points at shows "avoids: {phrase}" in muted text. No card ever shows a warning badge.
- [ ] Regional variants collapse under "+ n regional variants" (singular for one) and expand into rows with a region pill, the variant, a register pill when not neutral, and a confidence label. Low rows are greyed with a "check this" tooltip; unrated rows render neutrally. Cards with no alternatives show no toggle.
- [ ] Copy is a split button: the main click copies the chunk, the menu offers chunk + example. "Copy all" above the cards copies every chunk as TXT lines (`pattern — example_es — regions`). A toast confirms each copy.
- [ ] A phrase with no chunks shows the translation and the line "Nothing worth chunking here." A service error (422, 502, 503) or a network failure shows an inline message under the input with a Retry button, using the service's message when it has one.
- [ ] Three cards per row on desktop; cards stack at phone width with no horizontal scrolling.
- [ ] The whole app wears the mockup's look: one dark, warm palette with a terracotta accent and serif patterns, on every page. There is no light theme and no theme toggle. The header shows the wordmark at left and About at right. The teal theme is gone from every page.
- [ ] Every action is keyboard reachable, results are announced through an `aria-live` region, and confidence always carries a text label.
- [ ] When `CHUNKER_TOKEN` is set, `POST /v1/chunk` rejects requests without a matching `Authorization: Bearer` header with 401 and the standard error body; unset, it behaves as today. `/v1/health` and `/v1/meta` stay open. The web server function and `evals/run.py` send the token when configured; docker compose passes it to both services.
- [ ] Every chunk in the response carries `translation_highlight` (a `[start, end)` range inside `translation`, or null); the JSON Schema and TS types are regenerated; the schema fixture test passes.
- [ ] The Vitest, pytest, schema, lint, Prettier and type checks listed under Testing Approach all pass, and `run.py --split dev` reports recall and calque rate unchanged from 001.

### Non-Goals <!-- required -->

- Save button, "Saved · n", "Export to Anki", Postgres tables, export routes — 004. No disabled placeholders.
- Background `full` confidence call, query-cache patching, spinners on unrated rows — 003. In 002 `unrated` is a static neutral state.
- Regions beyond neutral, ES, MX, AR, CO.
- A light theme or theme toggle. The mockup is dark only; the scaffold's toggle and theme init script are removed rather than restyled.
- End-to-end browser tests (per OVERVIEW); verification is component and unit tests plus a manual smoke against the live service.
- Prompt, matcher or seed changes. 002 does not touch generation, so eval metrics should not move.
- Streaming responses, rate limiting, request logging, analytics, accounts.
- Anki or TXT file export; only the clipboard formats ship here.

### Open Questions <!-- optional -->

- **`highlight_range` and `contains_chunk` can disagree at the margins** (they share the lemma matcher but apply the gap rule differently). A chunk that passed validation but gets a null `translation_highlight` renders without an underline. If the spike or the eval JSONL shows this on more than a handful of chunks, log it as a 005 matcher-parity item. Not a blocker.

---

## How <!-- required -->

### Approach <!-- required -->

Work splits into five workstreams, sequenced at the end.

**1. Service additions (`services/chunker`, `evals/`, `packages/schema`)**

- `translation_highlight`: add `translation_highlight: list[int] | None = None` to `Chunk` in `models.py`. In `_assemble`, set it to `highlight_range(draft.translation, dc.surface)`, the same function that already computes `example.highlight`. Optional with a null default, so cached payloads written before the change stay valid and the schema fixture keeps compiling. Regenerate `packages/schema/chunk.schema.json` and `src/index.ts` with the existing scripts; add the field to `test/fixture.ts`.
- Service token: read `CHUNKER_TOKEN` from the environment at request time, never at import. A FastAPI dependency on `POST /v1/chunk` compares the `Authorization: Bearer …` header using `secrets.compare_digest`; on mismatch return 401 with `{ "error": { "code": "unauthorized", "message": … } }`. When the variable is unset the dependency is a no-op, so local dev and the existing tests keep working. `/v1/health` and `/v1/meta` are never guarded.
- Eval runner: a `--token` argument defaulting to `CHUNKER_TOKEN`, sent as the bearer header on the `httpx2` client when present.
- Compose: pass `CHUNKER_TOKEN` through to both `chunker` and `web` with an empty default.

**2. Web data layer (`apps/web/src`)**

- `lib/chunker.server.ts`: `chunkPhrase({ text, region })` fetches `${CHUNKER_URL}/v1/chunk` with `confidence_mode: 'fast'` and the bearer header when `CHUNKER_TOKEN` is set. Non-2xx responses are parsed against the `ErrorResponse` type into `{ status, code, message }`; network failures become `{ status: 0, code: 'network', message }`. Returns a discriminated union `{ ok: true, data: ChunkResponse } | { ok: false, error }` rather than throwing, so error details cross the server-function boundary predictably.
- `server/chunk.functions.ts`: `chunk = createServerFn({ method: 'POST' })` with a hand-written validator (trim, 1–200 characters, region in the enum, else a validation error) and a handler that calls `chunkPhrase` and, on success, sets a `trozo_region` cookie (`sameSite: 'lax'`, one year, path `/`) via `setCookie`. `getPreferredRegion = createServerFn()` reads that cookie with `getCookie` and returns a valid region or `neutral`.
- `lib/chunk-query.ts`: `chunkQueryOptions({ q, region })` → `queryKey: ['chunk', region, q]`, a `queryFn` calling the server function, `staleTime: Infinity` (a result is deterministic per prompt version and the service caches by the same key), `retry: false`, `enabled: q.length > 0`. A `{ ok: false }` result is returned as data, not thrown, so the UI branches on it.
- Route `/` (`routes/index.tsx`): `validateSearch` is a plain function: `q` trimmed and capped at 200 characters or omitted, `region` coerced to the enum or omitted. `stripSearchParams` keeps `region=neutral` out of the URL. The loader calls only `getPreferredRegion()` (cheap, no LLM) and returns `defaultRegion`. The LLM call is never made in the loader, because a loader fetch would block server rendering for the length of the call. The component calls `useQuery(chunkQueryOptions(search))` and renders the skeleton while pending. Submit navigates with `{ search: { q, region } }`; the URL is the single source of truth, so back and forward change the search, the query key changes, and cached results render at once. The selector's initial value is `search.region ?? defaultRegion`, identical on server and client, which avoids a hydration mismatch.

**3. Components (`components/translator/`)**

- `InputBar`: auto-growing textarea, counter, region select, "Chunk it"; Enter submits, Shift+Enter inserts a newline.
- `TranslationLine`: italic text, underlines from each chunk's `translation_highlight`, copy on hover.
- `WatchOutBox`: one row per note with the kind label, the struck-through `avoid` plus visually hidden "Avoid:", the reason, and "→ card NN" links built from `applies_to`. Cards carry `id="card-{chunk.id}"`; a link click scrolls the card into view and sets a transient attribute that drives a CSS flash.
- `ChunkCard` composed of `ExampleSentence`, `ConfidenceLabel`, `VariantsList`, a split `CopyButton`, and the "avoids:" line derived from notes whose `applies_to` includes the card's id.
- `ResultSkeleton`, `EmptyResult`, `InlineError`, and a toast. shadcn/ui primitives (button, dropdown-menu, tooltip, sonner) are added through the configured CLI as needed.
- Pure helpers with their own tests: `lib/highlight.ts` (`splitHighlight(text, range, surface)` validates the range, falls back to an accent- and case-insensitive search for `surface`, else returns null for plain rendering); `lib/copy.ts` (chunk only, chunk + example, all-as-TXT); `lib/labels.ts` (note-kind labels, region pill text, confidence dot + text including the "verified" rule: label `high` with `signals.seed` true).

**4. Theme (`styles.css`, `__root.tsx`, `Header`, `Footer`, `about.tsx`, `index.tsx`)**

- Replace the lagoon tokens with one warm palette read from the mockup: near-black warm base, a slightly lighter card surface, low-contrast warm lines, cream ink, muted stone text, a terracotta accent, and a terracotta-tinted panel for the watch-out box. Define every token once on `:root` with `color-scheme: dark`; delete the `.dark` block, the dark custom variant, the `ThemeToggle` component and the theme init script in the root document. Remap the shadcn base tokens (`--background`, `--card`, `--primary`, …) to the same palette so primitives match, and check body, muted and pill text against their surfaces for WCAG AA contrast.
- Fonts: Fraunces for the wordmark, patterns and translation; Manrope for UI text; a monospace stack for kind labels, pills and card numbers as in the mockup.
- Header: the wordmark links home; the right side holds About in a slot laid out so 004 can add "Saved · n" and "Export to Anki" without restructuring. Drop the "Home" nav link and the theme toggle.

**5. Test infrastructure (`apps/web`)**

- Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` and `jsdom`. Vitest config: `environment: 'jsdom'` for `.test.tsx`, a setup file for the jest-dom matchers, and alias support for `#/` so components import the way the app does. The config stays standalone per 000's decision.

**Sequencing**

1. Data-flow spike (the validation gate below) on a throwaway route.
2. Service additions and schema regeneration, so the web work sees real `translation_highlight` values.
3. Data layer and route wiring against the live service.
4. Components against the schema fixture, then against live responses.
5. Theme pass across all pages.
6. Tests green, lint and Prettier clean, manual smoke (see Testing Approach), then delete the spike route.

### Confidence <!-- required -->

**Level:** Medium

**Rationale:** The contract is generated and fixture-tested, the layout is specified twice over (mockup plus design-doc prose), the installed TanStack Start, Router and Query are current, and the service changes reuse existing functions. Two things are unproven in this repo: (1) a search-param-driven query under TanStack Start SSR, specifically keeping the LLM call out of the loader, getting error payloads across the server-function boundary intact, and hydrating a cookie-derived default without a mismatch; (2) Testing Library plus jsdom alongside the standalone Vitest config from 000 (aliases, CSS imports).

**Validate before proceeding:**

- **Data-flow spike** on a throwaway `/spike` route: `validateSearch`, one server function calling the local chunker, `useQuery` keyed by `[region, q]`. Check that the server-rendered HTML for `/spike?q=…` returns immediately with the skeleton while the call is in flight (curl during a request), that the browser console shows no hydration warnings, that back and forward re-render from the query cache with no new line in the chunker log, and that a forced 422 and a stopped chunker both surface a message the UI can show.
- **Test-runner check**: render one trivial component with Testing Library under the standalone Vitest config, importing through `#/`, before writing component tests.
- Record both outcomes in the decision record.

### Key Decisions <!-- optional -->

- **Mockup look app-wide** (human): one visual identity from 002 onward; the cost is a token pass over the header, footer and about page.
- **Dark only, no theme toggle** (human): the mockup is dark and nothing in the product docs asks for a light mode; a derived light palette would be an invented design with its own contrast work, so the scaffold's toggle goes rather than being restyled.
- **Fast call only** (human): a background `full` call would spend a second LLM request to receive nothing new until 003; 003 owns the upgrade path end to end.
- **Opt-in service token now** (human): matches ARCHITECTURE; opt-in so local dev and evals need no configuration.
- **`translation_highlight` computed by the service** (human, after reflect-back): lemma-level ranges cannot be computed in the browser ("Tengo" does not contain "tener"); an additive optional field keeps old cache entries and the fixture valid.
- **URL as the single source of truth, no LLM call in the loader** (agent, stated in reflect-back): a loader fetch blocks server rendering for the length of the LLM call; `useQuery` plus a skeleton matches the design doc's loading state and makes back and forward free.
- **Server function returns a discriminated result instead of throwing** (agent): keeps status and code intact across the RPC boundary and lets the UI branch without parsing messages.
- **Region memory in a cookie set server-side** (design doc): readable in the loader, so the initial selector value is identical on server and client.
- **Design-doc text over mockup image where they conflict** (agent, stated in reflect-back): no warning badge on cards and "avoids:" text instead; split Copy button; register pill only when not neutral, since a "neutral" pill on every card is noise and the mockup shows none.
- **`staleTime: Infinity`** (agent): results are deterministic per prompt version and model, and the service caches by the same key.
- **Hand-written validators, no zod** (agent): two fields on the route and two on the server function do not justify a new dependency; revisit if 004's filters grow the surface.

### Testing Approach <!-- required -->

Per OVERVIEW: Vitest + Testing Library on the web side, pytest on the service, the eval suite as the product bar.

**Vitest (`apps/web`)**

- `lib/chunker.server.test.ts` with a faked `fetch`: happy path returns typed data; 422, 502 and 503 bodies map to `{ status, code, message }`; a rejected fetch maps to status 0; the bearer header is present exactly when `CHUNKER_TOKEN` is set.
- Server-function validator: trims, rejects empty and 201-character input, rejects an unknown region, passes a valid pair through unchanged.
- Route `validateSearch`: junk keys dropped, `q` capped, bad `region` omitted, `region=neutral` stripped from the URL.
- `lib/highlight.test.ts`: a valid range splits into before, match and after; an out-of-bounds range falls back; null falls back to the accent-insensitive surface search; no match returns null.
- `lib/copy.test.ts`: chunk only, chunk + example, all-as-TXT line format and regions joining.
- `lib/labels.test.ts`: every note kind has a label; "verified" only for `high` with seed true; "unrated" text; variants count wording.
- Components with jsdom and user-event: `ChunkCard` renders number, pattern, slots, gloss, underlined example, "avoids:" when a note applies, never a warning badge, variants collapsed count and expansion; `WatchOutBox` renders the trap count, kinds, strike-through with "Avoid:" text, and links targeting the right card ids; `InputBar` submits on Enter, inserts a newline on Shift+Enter, shows the counter, blocks empty and over-long input; `TranslatorView` with a mocked query shows skeleton, empty, error-with-Retry and result states from the schema fixture.
- Copy: stubbed `navigator.clipboard.writeText`, asserting payloads and the toast.

**pytest (`services/chunker`)**

- Token: unset → 200; set and matching → 200; set and missing or wrong → 401 with the error body; health and meta open in every case.
- `translation_highlight`: assembled from a fake draft, the range covers the surface inside the translation; null when the surface is absent; a cached payload without the field still serves.
- Existing suite unchanged and green.

**Schema and eval**

- `pnpm --filter @trozo/schema test` compiles the regenerated types against the updated fixture.
- `run.py --split dev` with and without a token: same items, recall and calque rate unchanged from the 001 decision record; cite the numbers in 002's decision record.

**Manual smoke (not automated)**

The mockup phrase; a lone proper noun (zero chunks); a 201-character input (422 inline); the chunker stopped (network error, then Retry); back and forward across three results; phone width in devtools.
