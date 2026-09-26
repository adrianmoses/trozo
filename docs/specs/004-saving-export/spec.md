# Spec: Saving + Export

| Field   | Value      |
| ------- | ---------- |
| id      | 004        |
| status  | approved   |
| created | 2026-09-26 |

---

## Why <!-- required -->

A trozo result disappears as soon as the next phrase is typed. The job to be done is Spanish building blocks "I can actually reuse", and reuse means studying them later. OVERVIEW puts spaced repetition out of scope and sends it to Anki instead. That makes saving plus Anki-ready export the link between a good result and learning it. Without it, trozo is a lookup tool, not a study tool.

### Consumer Impact <!-- required -->

- **The author, as single user** (OVERVIEW):
  - Saves any chunk, or any single regional variant, with one click. The saved label always matches the settled label the card shows.
  - Finds saved items on `/saved`, filters them by region and tag, and deletes mistakes.
  - Downloads a CSV that Anki imports without editing, as Basic or Cloze cards, or a plain TXT list.
- **Portfolio reviewers:** not a direct audience for 004. Saved chunks carry `prompt_version`, which keeps them traceable to the prompt that produced them.
- **Integration points:**
  - The web app gains its first Postgres table (`saved_chunks`) and Drizzle migrations.
  - New save, list and delete server functions.
  - A streamed export route, `/api/export`.
  - A hook in 003's full-confidence cache patch that syncs labels for rows that are already saved.
  - The chunk service is unchanged.

### Roadmap Fit <!-- required -->

- **Depends on 002:** the chunk cards, the variants list, and the header's right-hand slot, which was reserved for "Saved · n" and "Export to Anki".
- **Depends on 003:** settled labels, and the `chunkFullQueryOptions` cache patch that the confidence sync hooks into. 003 was sequenced first so that saved chunks would carry meaningful labels.
- **005 is independent:** it grows the seed and the eval report, and it does not read saved chunks.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Saving, written as the user:

- [ ] Every chunk card has a Save button. Clicking it saves the chunk, the button turns into "Saved ✓" (not clickable), and the header count "Saved · n" goes up without a page reload.
- [ ] Every expanded regional-variant row has its own Save. A saved variant is a separate saved item with its own surface, example, regions, register and confidence. It uses the parent chunk's pattern and gloss.
- [ ] Save is available immediately, even while labels are still `unrated`.
  - If full confidence settles after a save, the saved item's confidence is updated to the settled label.
  - This also works if the user has already moved to another phrase.
  - If full confidence fails, the saved item stays `unrated`.
  - Seed-verified (`high`) items keep `high`.
- [ ] Saving an item that is already saved has no effect. Duplicates are identified by surface and Spanish example.
- [ ] Revisiting a phrase (back/forward, a shared `?q=` link, or a reload) shows "Saved ✓" on items that are already saved.
- [ ] If a save fails, a toast shows an error, the button returns to "Save", and the result on screen is untouched.

The `/saved` page, written as the user:

- [ ] The header links "Saved · n" to `/saved`. `/saved` lists saved items newest first. Each row shows the pattern, surface, Spanish and English example, a region pill, a register pill, a confidence label, and the source phrase.
- [ ] Rows can be filtered by region and by tag. Filters live in the query string (`/saved?region=MX&tag=register::coloquial`) so a filtered view can be shared and survives a reload.
- [ ] Each row has a Delete action. Deleting removes the row and lowers the header count. The card for that item shows "Save" again on its next render.
- [ ] Empty state: "Nothing saved yet", with a link back to the translator.

Export, written as the user importing into Anki:

- [ ] `/saved` has three export buttons: Anki (Basic), Anki (Cloze) and TXT. Each export applies the page's current filters. The header's "Export to Anki" link downloads the Basic CSV of everything saved.
- [ ] **Basic CSV** has columns `Front`, `Back`, `Tags`.
  - `Front` is the English example.
  - `Back` is the Spanish example with the chunk wrapped in `<b>`, followed by the pattern and the region(s).
  - It imports into Anki's Basic note type with "Allow HTML in fields" on, and needs no editing.
- [ ] **Cloze CSV** has columns `Text`, `Extra`, `Tags`.
  - `Text` is the Spanish example with the chunk as a cloze, e.g. `Tengo {{c1::muchas ganas de}} verte.`
  - `Extra` is the English example, the pattern and the region(s).
  - It imports into Anki's Cloze note type, and every row has at least one cloze deletion.
- [ ] **TXT** has one item per line: `pattern — example_es — regions`.
- [ ] All exports are UTF-8 with a BOM, so accents survive both Excel and Anki. Commas, quotes and newlines in fields are escaped per RFC 4180. Downloads have a dated filename, e.g. `trozo-2026-09-26.csv`.
- [ ] Tags are derived automatically and are the same in the database, the filters and the export: `trozo`, `region::<R>` for each region, and `register::<register>`.

Engineering:

- [ ] `docker compose up` on an empty database creates the `saved_chunks` table, with no manual step. Locally, `pnpm db:migrate` against Compose Postgres does the same. The migrations are committed.
- [ ] No save, delete, list or export path calls the chunk service or an LLM.
- [ ] Vitest, type-check, ESLint and Prettier all pass. pytest and the evals are unaffected.

### Non-Goals <!-- required -->

- **No `chunk_cache` Postgres table.** The design doc's table is superseded by the chunk service's disk cache (ARCHITECTURE, 001).
- **No feedback UI.** The `feedback` column exists (default `0`), and thumbs up/down comes later.
- **No tag editing.** Tags are derived automatically only.
- **No unsave toggle on the card.** "Saved ✓" is final there, and removal happens on `/saved`.
- **No editing saved items** (surface, example, notes, region).
- **No auth or multi-user.** `user_id` stays null (OVERVIEW).
- **No `.apkg` generation, AnkiConnect sync, or in-app review or spaced repetition.**
- **No Anki note-type or deck setup** beyond documenting the import settings in the README.
- **No bulk actions on `/saved`** (multi-select delete, "Copy all" of saved items).
- **No changes to the chunk service contract or the prompts.**

### Open Questions <!-- optional -->

- **English example for variant rows.** `Alternative` has no `example.en`. Proposed default: a variant row stores its parent chunk's `example.en`, since both examples mirror the same input. If they turn out to diverge in meaning, fall back to the parent's `gloss_en` for `Front`. Resolve during implementation and record the choice in the decision record.
- **Locating the chunk inside a variant's example.** Chunks have `example.highlight`, but alternatives do not. Proposed default: bold or cloze the first case-insensitive match of the variant's `surface` in `example_es`.
  - If the surface isn't found (conjugated forms), the Basic `Back` stays unbolded.
  - The Cloze `Text` becomes `{{c1::surface}} — example_es`, so the row still has a deletion.
  - The share of rows that hit this fallback is measured once real saves exist. If it is high, adding a highlight to `Alternative` in the service is a follow-up, not part of 004.

---

## How <!-- required -->

### Approach <!-- required -->

**Schema (`apps/web/src/db/schema.ts`).** One Drizzle table, `saved_chunks`, following the design doc's schema:

- `id` uuid pk (`gen_random_uuid()`)
- `user_id` uuid null
- `source_text`
- `region_requested` (the region the phrase was chunked with)
- `pattern`, `surface`, `gloss_en`, `example_es`, `example_en`
- `highlight` int[] null (`[start, end]` into `example_es`, copied from `example.highlight` for chunks)
- `register`
- `regions` text[]
- `confidence` (`high|med|low|unrated`)
- `notes` jsonb: the response's notes whose `applies_to` includes the chunk id
- `tags` text[]
- `feedback` smallint default 0
- `prompt_version`
- `kind` (`chunk|variant`)
- `created_at`

Uniqueness is `(user_id, surface, example_es)`, with nulls not distinct (Postgres 15+ `NULLS NOT DISTINCT`) so that single-user saves with a null `user_id` are still deduplicated. Region and tag filters use GIN indexes on `regions` and `tags`. Migrations are generated with `drizzle-kit generate` into `apps/web/drizzle/` and committed. The web Docker image runs a small `migrate` script (drizzle-orm's node-postgres migrator) before starting the server.

**Pure mapping (`apps/web/src/lib/saved.ts`).**

- `toSavedRow(response, chunk, alternative?)` builds an insert row from a chunk or a variant.
- `deriveTags(regions, register)` builds the tag list.
- `savedKey(surface, example_es)` builds the identity used for "already saved".

**Server functions (`apps/web/src/server/saved.functions.ts`).** Input is validated the same way as in `chunk.functions.ts`.

- `saveChunkFn(row)`: `insert … on conflict do nothing`. Returns the row id either way.
- `savedIndexFn()`: returns `{ count, keys }` (the `savedKey`s), which drive "Saved · n" and "Saved ✓". It uses the TanStack Query key `['saved-index']`.
- `listSavedFn({ region?, tag? })`: backs `/saved`.
- `deleteSavedFn(id)`.
- `syncConfidenceFn(items: {surface, example_es, confidence}[])`: updates matching rows only where the stored label is `unrated` and the new one is settled. Rows that aren't saved are a no-op.

Save and delete mutations invalidate `['saved-index']` and the `/saved` list query, with an optimistic "Saved ✓".

**Confidence sync (patch-later).**

- **Main hook:** in `chunkFullQueryOptions`, right after the existing `setQueryData`, collect the settled labels of every chunk and alternative in the result that is in the saved index. If any are found, call `syncConfidenceFn`. Because this runs in the query function, not in a component, it completes even after the user has moved to another phrase.
- **Race window:** a save can be in flight while full confidence settles. To cover it, `saveChunkFn`'s `onSuccess` re-reads the item's label from the query cache. If the label has settled since the click, it calls `syncConfidenceFn` for that item.
- **Why the `unrated`-only guard:** it makes both calls idempotent and order-independent.

**UI.**

- A `SaveButton` next to Copy in `ChunkCard` and in each `VariantsList` row, with states Save / Saving… / Saved ✓.
- The header slot gets "Saved · n" (a link to `/saved`) and "Export to Anki" (`/api/export?format=csv`).
- A new file route, `src/routes/saved.tsx`. It has a search-param schema for `region` and `tag`, a loader that prefetches `listSavedFn`, a region select and tag chips as filters, a list of rows with Delete (shadcn `AlertDialog` confirm, with no native `confirm()`), and three export links that carry the current filters.

**Export route (`/api/export`).**

- A TanStack Start server route that takes `format=csv|cloze|txt` and optional `region`/`tag`.
- It streams a `ReadableStream`: the BOM first, then a header row for the CSV formats, then one line per row read in pages from Postgres.
- Headers: `Content-Type` (`text/csv; charset=utf-8` or `text/plain; charset=utf-8`) and `Content-Disposition: attachment; filename="trozo-<date>[-cloze].<ext>"`.
- Line formatting is pure: `formatBasicRow`, `formatClozeRow`, `formatTxtLine` and `csvEscape` in `apps/web/src/lib/export.ts`.
- Bold and cloze spans use the stored `highlight` when present, and otherwise the surface-match fallback from Open Questions.

**Docs.** The README gains an "Export to Anki" section: which note type to pick, "Allow HTML in fields", and mapping tags to the third column. ARCHITECTURE's component map and data flow already describe 004. Its `/api/export` line gains `cloze` when the decision record lands.

### Confidence <!-- required -->

**Level:** High

**Rationale:**

- **Already specified:** the storage schema, export formats, BOM and route shape all come from the design doc.
- **Already in place:** Drizzle, `pg`, `drizzle.config.ts`, a `db` client, and Postgres in Compose.
- **Main subtlety:** updating a saved label after full confidence settles. Hooking into 003's existing cache patch point, the save-side re-check, and the `unrated`-only guard make it order-independent, and unit tests cover it without a separate spike.
- **Smaller unknowns (see Open Questions):** the English example and the chunk span for variant rows. Both have safe fallbacks that keep every export row importable.

### Key Decisions <!-- optional -->

- **Two CSV formats rather than one.** Anki imports Basic and Cloze note types separately, so a single mixed CSV can't serve both.
- **Only `unrated` → settled updates.** A saved row's label never moves between settled values, and no label ever goes back to `unrated`. This makes the sync safe to repeat and to run in any order.
- **Variants are first-class rows** (`kind = 'variant'`) rather than nested under their chunk. This keeps export and filtering to one row = one card.
- **Saved state is identified by `(surface, example_es)`**, not by chunk id. Chunk ids are only stable within a single response, while surface and example stay stable across cached revisits of the same phrase.

### Testing Approach <!-- required -->

Per OVERVIEW's testing suite: Vitest + Testing Library, with no e2e.

- **Mapping (`saved.test.ts`):**
  - `toSavedRow` for a chunk and for a variant, including parent pattern/gloss inheritance, notes filtered by `applies_to`, and `highlight` copied only for chunks.
  - `deriveTags` for neutral, a single region, multiple regions, and each register.
  - `savedKey` stability.
- **Export formatting (`export.test.ts`):**
  - BOM present exactly once.
  - Header rows.
  - RFC 4180 escaping of commas, quotes and embedded newlines.
  - `<b>` wrapping via `highlight`.
  - The surface-match fallback, and the no-match fallback (Basic unbolded; Cloze `{{c1::surface}} — example_es`).
  - Every cloze row contains `{{c1::`.
  - Accents and `ñ` round-trip.
  - TXT line format.
- **Confidence sync (`chunk-query.test.ts`, extended):**
  - After a successful full result, `syncConfidenceFn` is called with only the saved items' settled labels.
  - It is not called when nothing is saved or when full confidence fails.
  - The save-during-flight path: save succeeds after settle → sync is called for that item.
- **Server functions (`saved.functions.test.ts`):**
  - Input validation.
  - Insert-on-conflict idempotency.
  - `syncConfidenceFn` updates `unrated` rows only.
  - Filters by region and tag.
  - Delete.
  - These run against Compose Postgres via `TEST_DATABASE_URL` in a throwaway schema, and are skipped when it is unset.
- **Components:**
  - `SaveButton` states and the error toast.
  - A `ChunkCard` / `VariantsList` row shows "Saved ✓" when its key is in the saved index.
  - `/saved` renders rows, applies search-param filters, deletes after confirm, and shows the empty state.
  - The header shows the count and both links.
- **Export route:** content type, disposition filename, and the streamed body for a small fixture set, with the db layer faked.
- **Manual check before the decision record:** import one Basic and one Cloze export into a fresh Anki profile and confirm zero import warnings. Record the result in the decision record.
