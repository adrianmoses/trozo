# 002 evidence log (for the decision record)

## Gate 1 — data-flow spike (2026-09-24, dev server + local chunker)

- SSR of /spike?q=I miss you&region=MX: HTTP 200 in 0.069s cold, 0.013s warm; HTML contains the skeleton marker and no result; chunker log shows 0 POST /v1/chunk from SSR.
- Loader runs on the server per request ("loader run N server"); after client-side submit (navigate with new search) no "loader run … client" line appeared -> route staleTime: Infinity prevents re-fire.
- Cookie: `Cookie: trozo_region=AR` -> defaultRegion AR; no cookie -> neutral; bogus XX -> neutral. Server fn setCookie during POST; next full load of /spike rendered defaultRegion=AR.
- Client submit: URL -> /spike?q=I'm+hungry&region=AR, exactly one POST /_serverFn/... (200), result rendered ("Tengo hambre." / "tener hambre", latency 5043ms).
- history.back()/forward(): both earlier results rendered instantly from the query cache; network still 1 server-fn POST; chunker log unchanged (4 POSTs total: 2x200 for the two phrases, 2x422 = one direct curl probe + one browser 422 check).
- 422 (non-English "ñññ ááá") surfaced as "ERROR 422 invalid_input: input does not look like English text".
- Chunker stopped -> "ERROR 0 network: fetch failed" surfaced via the discriminated result.
- Console filtered for hydrat|mismatch|Warning|Uncaught|TypeError: none.
- Note: the Chrome extension's synthetic typing did not reach the controlled input; native-setter + input event worked. Irrelevant to the app.

## Gate 2 — test runner

- @testing-library/react 16.3.3, jest-dom 7.0.1, user-event 14.6.7, jsdom 30.1.1; vitest 3.2.7 with environment: 'jsdom' globally + setupFiles.
- `#/` subpath import resolved with no alias config (package.json "imports"). 2 files / 2 tests pass in 2.25s.

## Open question — translation_highlight nulls

- Offline over evals/results/*.jsonl: 49 unique (translation, surface) pairs, 0 nulls from highlight_range(translation, surface).

## Service + contract (2026-09-24)

- pytest services/chunker: 47 passed (was 40; +2 highlight, +5 token). Key assertions: make_draft() -> translation_highlight [0, 21]; monkeypatched None serialises as null; a cache entry written without the key is served with the key absent.
- Schema regen: `uv run scripts/export_schema.py` + `pnpm --filter @trozo/schema generate`; generated type `translation_highlight?: TranslationHighlight` (optional, number[] | null); fixture updated; `pnpm --filter @trozo/schema test` (tsc) clean.
- Live token check on a second instance (port 8001, CHUNKER_TOKEN=s3cret): no header -> 401 {"error":{"code":"unauthorized"}}; wrong token -> 401; correct token -> 200 (cached phrase, translation_highlight absent as expected for a pre-change cache entry); /v1/meta open.
- Eval dev split: no-token instance -> items 15, chunk recall 0.98, calque rate 0.00 (unchanged from 001). Token instance with `--token s3cret` -> 0.98 / 0.00. Token instance without token -> 0.00 / 1.00 (every request 401, counted as failures) — the guard is effective.

## Web (2026-09-24)

- vitest: 13 files / 57 tests pass (lib: chunker.server 9, chunk-input 4, search 3, highlight 8, copy 4, labels 4, utils 1; components: ChunkCard 6, WatchOutBox 3, InputBar 4, TranslatorView 6, CopyButton 4; runner 1).
- tsc --noEmit clean; eslint clean; prettier check clean (repo-wide).
- `pnpm --filter web build` exit 0.
- Palette contrast (WCAG, computed): ink/canvas 14.8, ink/surface 13.5, ink-muted/surface 6.1, ink-muted/surface-2 6.5, ink-faint/surface 4.9, ink-faint/canvas 5.4, brand-text/brand-soft 5.9, brand-text/surface 6.0, ink/brand-soft 13.2, brand-ink/brand (button) 4.68 after darkening brand from #c94b26 to #c4461f. All >= 4.5 (AA).
- Browser (dev server, mockup phrase at neutral): SSR of `/` in 0.28s with the form and tagline; `/?q=…` with cookie AR pre-selects Argentina and ships the skeleton; result renders translation with 3 underlined chunks, watch-out box with 2 traps and "→ card 01/02" links, 3 cards (numbers, patterns, slot pills, glosses, underlined examples, "avoids:" lines, variant toggles, Copy split buttons). Variants expand to rows (region pill, surface, confidence). Card link sets data-flash on the target card. No console errors or hydration warnings.
- Divergence implemented: no stripSearchParams — region always in the URL (shared links re-run at the generating region).
- Note: shadcn CLI wrote `import { cn } from "cn"` (alias resolution bug) and a next-themes dependency; both fixed by hand (utils alias; toaster pinned to theme="dark", next-themes removed).
- Note: Testing Library auto-cleanup does not run without Vitest globals; added afterEach(cleanup) to src/test/setup.ts. user-event installs its own clipboard stub on setup; tests spy on it after setup.

## Manual smoke (browser, 2026-09-24)

- Zero chunks: "Madrid" at ES -> translation "Madrid.", 0 cards, "Nothing worth chunking here." shown.
- Back/forward across results: mockup phrase result and the Madrid result each re-rendered instantly from the query cache (no skeleton); textarea and region selector followed the URL each time.
- Docker: `docker compose build web` exit 0 with the new `COPY packages/schema` step.
- Phone width: the Chrome extension's resize_window did not change the viewport (innerWidth stayed 1680), so the stacked layout was not screenshotted. Structurally: cards use `grid md:grid-cols-3` (single column under 768px), page-wrap is `min(1120px, calc(100% - 2rem))`, no fixed widths; desktop shows no horizontal overflow (scrollWidth == innerWidth).

## Error path and Retry on the real route (browser, 2026-09-24)

- Chunk service stopped: submitting "Where is the train station" showed the inline alert "Couldn't reach the chunk service (fetch failed)." with a Retry button, no skeleton, no cards.
- Service restarted, Retry clicked: skeleton returned, alert cleared, result "¿Dónde está la estación de tren?" rendered with 2 cards.
- Copy: a real click on card 01's Copy button wrote to the clipboard and showed the "Copied chunk" toast (sonner, bottom-center).
