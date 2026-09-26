# Decision Record: Saving + Export

| Field   | Value                |
| ------- | -------------------- |
| id      | 004                  |
| status  | implemented          |
| created | 2026-09-26           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

Until 004 a trozo result disappeared as soon as the next phrase was typed. The spec was written at **High** confidence: the design doc already fixed the storage schema, the export formats and the route shape. During discovery the human chose four things:

- **Save before labels settle:** Save works immediately, and the saved label is updated once full confidence settles.
- **Two Anki CSVs:** separate Basic and Cloze exports.
- **Derived tags:** tags are generated from region and register only; there is no tag editor.
- **Variants and delete:** regional variants can be saved on their own, and rows are deleted on `/saved`, not by unsaving on the card.

Several things found during implementation and review shaped the result:

- **The runtime web image cannot migrate.** Nitro's `.output` has neither `drizzle-kit` nor the migrations folder, so migrations moved to a one-shot Compose service (see Spec Divergence).
- **Two latent bugs showed up only in a real browser**, not in unit tests:
  - The saved-item key used a `\u0000` separator, which did not survive server-rendered state reaching the client. Cards showed "Save" for saved items after a full page load.
  - The export's keyset cursor compared JS `Date`s (milliseconds) with microsecond `timestamptz` values, which could skip rows between pages.
- **"Save failed" with a 200 response.** The human hit this during review. The code was fine: their dev server's `DATABASE_URL` was still the `.env.local` template value, and a native Postgres on port 5432 rejected the login. TanStack Start returns server-function errors as HTTP 200 with the error serialized in the body (`x-tss-serialized`), which made it look like a client bug. Save and delete failures now also log the cause to the console.
- **The first real Anki import put every field on Front.** The Basic CSV began with a plain `Front,Back,Tags` row, so Anki guessed the separator wrong. That row would also have been imported as a note. Both CSVs now start with Anki file headers.
- **The chunker container crashes on startup in Docker** (`IndexError` at `parents[4]` in `app/pipeline/seed.py`, from the bug 001 fix). This is unrelated to 004 and left for a separate fix. End-to-end checks used a locally run chunker instead.

Work was done on `feature/004-saving-export`; not yet merged.

## Decision <!-- required -->

**Storage.** Saved chunks and single regional variants live in one Postgres table, `saved_chunks`, owned by the web app. One row is one Anki card.

- Identity is `(user_id, surface, example_es)` with `UNIQUE NULLS NOT DISTINCT`, so single-user rows (null `user_id`) still deduplicate. This requires Postgres 15+.
- Saving is an insert that does nothing on a duplicate.
- Tags come from `deriveTags` (`trozo`, `region::<R>`, `register::<r>`) on the server, so the database, the `/saved` filters and the exports always agree.

**Labels after save.** A saved `unrated` label is brought in line with the settled label in two places:

- `chunkFullQueryOptions` calls `syncConfidenceFn` right after it patches the query cache. This runs in the query function, not a component, so it completes even after the user has moved on.
- The save mutation's `onSuccess` re-checks the cache, which covers a save that is still in flight when labels settle.

The server only moves `unrated` → settled, so both calls are idempotent and order-independent.

**UI.**

- A Save → Saving… → "Saved ✓" button sits on each card and each expanded variant row.
- The header's "Saved · n" is server-rendered from a root-loader prefetch.
- `/saved` is filtered through the query string (`?region=&tag=`) and deletes through a confirm dialog.

**Export.** `/api/export?format=csv|cloze|txt` streams from Postgres in pages of 500: UTF-8 BOM, then Anki file headers for the CSVs (`#separator:Comma`, `#html:true`, `#notetype:Basic|Cloze`, `#columns:…`, `#tags column:3`), then rows.

- **Locating the chunk for bold and cloze:** the stored highlight is used for chunks. For variants it is the first case-insensitive match of the surface with slot markers like "+ inf." removed. When nothing matches, the Cloze text becomes `{{c1::surface}} — example`, so every row still imports.
- **Variant rows** take the parent chunk's `example.en`.
- **Nothing in these paths calls the chunk service or an LLM.**

---

## Alternatives Considered <!-- required -->

### When a saved label is written

**Option A: Snapshot at save time.**

- Pros: simplest; one write.
- Cons: saved rows keep `unrated` whenever Save is clicked during the spinner, which is the common case.

**Option B: Disable Save until labels settle.**

- Pros: the saved label is always final.
- Cons: a few seconds of friction on every non-seed phrase.

**Option C: Save now, sync after settle.**

- Pros: no friction; the saved label ends up matching the card.
- Cons: a second write path and a race (a save in flight while labels settle).

**Chosen:** C, the human's choice. The race is closed by the save-side cache re-check. The server's `unrated`-only guard makes both writes safe in any order.

### How migrations run under Compose

**Option A: Migrate script inside the web runtime image (the spec's approach).**

- Pros: one container.
- Cons: the image only holds Nitro's `.output`. It would need `drizzle-kit` or a bundled migrator plus the `drizzle/` folder copied in.

**Option B: Nitro startup plugin calling drizzle-orm's `migrate()`.**

- Pros: no extra service.
- Cons: migrations run on every web start and in every replica; bundling behaviour untested.

**Option C: One-shot `migrate` service reusing the Dockerfile's `build` stage.**

- Pros: the runtime image is unchanged. `web` waits for `service_completed_successfully`, so no manual step is needed. It is the same `pnpm db:migrate` used locally.
- Cons: one more Compose service; a hosted deploy needs its own release step.

**Chosen:** C. It meets the criterion ("`docker compose up` … no manual step") without growing the runtime image.

### Anki CSV preamble

**Option A: Plain header row `Front,Back,Tags` / `Text,Extra,Tags` (the spec's approach).**

- Pros: readable in spreadsheets; matches the spec text.
- Cons: Anki imports the row as a note. Anki also guessed the separator wrong in the human's first import, putting every field on Front.

**Option B: No header row.**

- Pros: nothing extra becomes a note.
- Cons: the separator is still guessed, HTML and the Tags column still have to be set by hand, and the columns are unnamed.

**Option C: Anki file headers (`#separator`, `#html`, `#notetype`, `#columns`, `#tags column`).**

- Pros: the separator, HTML, note type and Tags column are preset, and the column names are kept in `#columns`. Anki's importer strips the BOM before reading headers. It ignores an unknown `#notetype`, so renamed note types fall back to the import dialog. Both points were checked in `rslib/src/import_export/text/csv/metadata.rs`.
- Cons: needs Anki 2.1.54+. Spreadsheets show the `#` lines as the first rows.

**Chosen:** C, after the human's failed import. The BOM stays for Excel.

### Saved-item identity

**Option A: Chunk id.**

- Pros: already on every chunk.
- Cons: ids are only stable within one response.

**Option B: `surface` + `example_es`, joined by a control-character separator.**

- Pros: stable across cached revisits.
- Cons: it broke in practice; after a server-rendered load the keys no longer matched on the client.

**Option C: `JSON.stringify([surface, example_es])`.**

- Pros: unambiguous for any text and safe to serialize.
- Cons: slightly longer keys.

**Chosen:** C (B was the first implementation).

### Where tags come from

**Option A: Derived only.** **Option B: Derived + user-editable.**

**Chosen:** A, the human's choice. Editing needs an editor, an update function and rules for merging tags on re-save, and none of that was needed for the job.

### Test database strategy

**Option A: Mock Drizzle.**

- Pros: always runs.
- Cons: cannot test `ON CONFLICT`, `NULLS NOT DISTINCT`, array containment or keyset paging, which is where the risk is.

**Option B: Real Postgres via `TEST_DATABASE_URL`, one throwaway schema per run, skipped when unset.**

- Pros: exercises the real SQL.
- Cons: silently skipped unless the variable is set.

**Chosen:** B for the repository. Everything above it (server route, mutations, components) mocks `saved.server`.

---

## Tradeoffs <!-- required -->

- **Single-user assumptions are built in.** Every query filters `user_id IS NULL`. Adding auth means changing that filter and the unique key's meaning, not just filling a column.
- **The identity rule treats two saves with the same surface and example from different phrases as one item.** The first save's `source_text`, notes and pattern win.
- **Sync is best-effort.** If the sync call fails, or the tab closes before full confidence resolves, the row stays `unrated` for good. Nothing re-scores saved rows later.
- **Sync issues one `UPDATE` per item.** That's fine at a handful of items per result, not built for bulk.
- **The Cloze fallback (`{{c1::surface}} — example`) is a weaker card than an in-sentence cloze.** It trades card quality for every row importing.
- **`#` header lines make the CSVs slightly less spreadsheet-friendly** in exchange for a clean Anki import.
- **Postgres 15+ is now a deploy constraint.** On older versions the unique constraint would not deduplicate null-owner rows.
- **Database tests are opt-in.** A run without `TEST_DATABASE_URL` reports them as skipped, not failed.

---

### Spec Divergence <!-- optional -->

| Spec Said                                                                         | What Was Built                                                                                        | Reason                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Web Docker image runs a small migrate script before starting                      | One-shot Compose `migrate` service on the `build` stage; `web` depends on it completing               | Runtime image has no `drizzle-kit` or migrations folder; see Alternatives                      |
| Basic CSV columns `Front, Back, Tags` / Cloze `Text, Extra, Tags` as a header row | Anki file headers; column names kept in `#columns:`                                                   | A plain header row imports as a note, and Anki mis-guessed the separator (all fields on Front) |
| `savedKey(surface, example_es)` (format unspecified)                              | `JSON.stringify([surface, example_es])`                                                               | A `\u0000` separator broke keys after a server-rendered load                                   |
| `created_at` timestamptz                                                          | `timestamptz(3)`                                                                                      | JS `Date` loses microseconds; the keyset cursor needs exact round-trips                        |
| Surface match: "first case-insensitive match of the variant's surface"            | Same, after removing trailing slot markers (`+ inf.`)                                                 | Variant surfaces like "me hace mucha ilusión + inf." never match verbatim                      |
| `syncConfidenceFn` hook reads the saved index; `ensureQueryData` if missing       | Reads the cache, else `fetchQuery`                                                                    | Same effect; `fetchQuery` returns the data directly inside the query function                  |
| Export route streams rows (logic implied in the route file)                       | Stream builder in `src/server/export.server.ts`; the route only parses params                         | A test file under `src/routes` triggered a route-generator warning on every dev start          |
| Header "Saved · n" from the saved index                                           | Also prefetched in the root loader (`prefetchQuery`, never throws)                                    | Without it the server rendered "Saved · 0" until the client fetched                            |
| Not specified                                                                     | `drizzle.config.ts` also reads the repo root's `.env.local`/`.env`                                    | Honcho and the README keep env in the root; `pnpm db:migrate` could not find `DATABASE_URL`    |
| Not specified                                                                     | Save/delete failures `console.error` the cause                                                        | Start returns server-function errors as HTTP 200; the toast alone hid the cause                |
| Not specified                                                                     | `.prettierignore` skips `apps/web/drizzle/meta/`; test DOM shims guarded for `node`-environment files | Generated files; database and stream tests run in Node                                         |

Everything else matches the spec: schema columns, tag format, the `unrated`-only sync, variants as rows, `/saved` filters in the query string, delete via `AlertDialog`, TXT format, BOM, RFC 4180 escaping, dated filenames, and no chunk-service or LLM calls.

**Open Questions from the spec:**

- **English example for variant rows:** resolved with the proposed default. Variant rows store the parent chunk's `example.en`. In the one real phrase checked ("I can't stand waiting in line" → _hacer cola_), the parent's English example fits the variant's Spanish example.
- **Locating the chunk in a variant's example:** implemented as proposed, plus slot-marker removal. The share of rows that hit the fallback **has not been measured**: only one real variant was saved during verification (_hacer cola_, which matched). This needs real saves; see Spec Gaps.

**Manual Anki check:** the first import failed: the Basic CSV with a plain header row put everything on Front. After the switch to file headers, the human re-tested the import and reported no further issues, which covers the criteria "imports into Anki's Basic/Cloze note type … needs no editing".

---

## Spec Gaps Exposed <!-- optional -->

- **Local dev setup has no working `DATABASE_URL`.** The root `.env.local` holds a template value. On machines with a native Postgres on 5432, the Compose Postgres is unreachable at `localhost:5432`. README now documents the setup, but the template and the port clash are unresolved. Consider mapping Compose Postgres to another host port.
- **Chunker container crash under Docker** (`parents[4]` in `seed.py`, from the bug 001 fix). Needs an `ss-fix`; `docker compose up` currently starts web, Postgres and migrate but not the chunker.
- **TanStack Start reports server-function errors as HTTP 200.** Worth a line in ARCHITECTURE: the network tab is not evidence of success, and errors should be logged client-side.
- **`Alternative` has neither `example.en` nor a highlight.** Both variant-row gaps above come from the contract. If the fallback share turns out high, adding `highlight` (and `example_en`) to `Alternative` in the service is the follow-up the spec anticipated.
- **"Imports without editing" cannot be covered by automated tests.** It was verified manually. Keeping it verified needs a manual Anki check per release, or a fixture test against Anki's own CSV metadata parser.
- **Tag chips on `/saved` come from the rows currently listed**, so choosing one filter hides the chips for other tags until it is cleared. The spec didn't say where chips come from.
- **Identity collisions across phrases** (same surface and example from different inputs) keep the first save's source and notes. The spec's identity rule implies this, but doesn't say it.
- **ARCHITECTURE** needed `cloze`, the `migrate` service and the Postgres 15+ constraint; updated alongside this record.

---

## Test Evidence <!-- required -->

Suites on `feature/004-saving-export` (2026-09-26). The web suite was run with `TEST_DATABASE_URL` pointing at a throwaway `postgres:16` container, so the repository tests executed rather than skipped:

```
$ TEST_DATABASE_URL=postgres://trozo:trozo@localhost:55432/trozo npx vitest run
 ✓ src/lib/utils.test.ts (1 test)
 ✓ src/lib/chunker.server.test.ts (10 tests)
 ✓ src/lib/saved.test.ts (11 tests)
 ✓ src/test/runner.test.tsx (1 test)
 ✓ src/lib/chunk-query.test.ts (9 tests)
 ✓ src/components/translator/WatchOutBox.test.tsx (3 tests)
 ✓ src/lib/saved-query.test.tsx (4 tests)
 ✓ src/components/Header.test.tsx (1 test)
 ✓ src/components/translator/ConfidenceLabel.test.tsx (3 tests)
 ✓ src/components/translator/InputBar.test.tsx (4 tests)
 ✓ src/components/translator/CopyButton.test.tsx (4 tests)
 ✓ src/components/translator/SaveButton.test.tsx (5 tests)
 ✓ src/server/export.server.test.ts (3 tests)
 ✓ src/components/translator/TranslatorView.test.tsx (8 tests)
 ✓ src/components/saved/SavedView.test.tsx (5 tests)
 ✓ src/lib/highlight.test.ts (8 tests)
 ✓ src/lib/labels.test.ts (4 tests)
 ✓ src/lib/chunk-input.test.ts (4 tests)
 ✓ src/lib/export.test.ts (15 tests)
 ✓ src/components/translator/ChunkCard.test.tsx (8 tests)
 ✓ src/lib/search.test.ts (3 tests)
 ✓ src/lib/copy.test.ts (4 tests)
 ✓ src/server/saved.server.test.ts (6 tests)
 Test Files  23 passed (23)
      Tests  124 passed (124)

$ npx vitest run            # without TEST_DATABASE_URL
      Tests  118 passed | 6 skipped (124)

pytest services/chunker: 72 passed in 2.21s
packages/schema test$ tsc --noEmit            (clean)
apps/web tsc --noEmit: clean
eslint: clean
prettier: All matched files use Prettier code style!
pnpm build: [nitro] ✔ You can preview this build using npx vite preview
```

Migration on an empty database (throwaway `postgres:16`, then Compose):

```
$ DATABASE_URL=postgres://trozo:trozo@localhost:55432/trozo pnpm db:migrate
[✓] migrations applied successfully!
    "saved_chunks_identity" UNIQUE CONSTRAINT, btree (user_id, surface, example_es) NULLS NOT DISTINCT

$ docker compose up -d --build
 Container trozo-postgres-1 Healthy
 Container trozo-migrate-1 Exited          # exit code 0
 Container trozo-web-1 Started
$ docker compose exec postgres psql -U trozo -c '\dt'
 public | saved_chunks | table | trozo
```

Browser run (local chunker + web dev on the throwaway database). Card 01 of "I can't stand waiting in line" (MX) was saved while its label showed the `unrated` spinner. The _hacer cola_ variant was saved after its label settled:

```
  kind   |   surface   | confidence |  regions   |                            tags
---------+-------------+------------+------------+------------------------------------------------------------
 chunk   | no soportar | med        | {neutral}  | {trozo,region::neutral,register::neutral}
 variant | hacer cola  | high       | {ES,AR,CO} | {trozo,region::ES,region::AR,region::CO,register::neutral}
```

Also observed in that session:

- "Saved ✓" persisted across reloads (after the key fix).
- The header count went 0 → 2 → 1 across save and delete.
- The `region::ES` chip filtered to one row and wrote `?tag=region%3A%3AES`.
- Delete asked for confirmation, and the variant's card showed "Save" again afterwards.
- `format=xml` returned 400.
- The export arrived with `Transfer-Encoding: chunked` and `content-disposition: attachment; filename="trozo-2026-09-26.csv"`.

Export bodies from that session (before the Anki-header change; rows are unchanged since):

```
Front,Back,Tags
I can't stand waiting in line.,"No soporto <b>hacer cola</b>.<br>hacer fila · ES, AR, CO",trozo region::ES region::AR region::CO register::neutral
I can't stand waiting in line.,<b>No soporto</b> hacer fila.<br>no soportar + inf. · neutral,trozo region::neutral register::neutral

Text,Extra,Tags
No soporto {{c1::hacer cola}}.,"I can't stand waiting in line.<br>hacer fila · ES, AR, CO",trozo region::ES region::AR region::CO register::neutral

hacer fila — No soporto hacer cola. — ES, AR, CO
no soportar + inf. — No soporto hacer fila. — neutral
```

Current CSV preamble, asserted by `export.test.ts` and `export.server.test.ts`:

```
﻿#separator:Comma
#html:true
#notetype:Basic
#columns:Front,Back,Tags
#tags column:3
```

Anki import (manual, by the human): with a plain header row, Basic put all fields on Front. After the switch to file headers, the import was re-tested with no further issues reported.
