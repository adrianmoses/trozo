import { and, arrayContains, desc, eq, isNull, lt, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { savedChunks } from '#/db/schema'
import type * as schema from '#/db/schema'
import type { SavedChunk } from '#/db/schema'
import { deriveTags, savedKey } from '#/lib/saved'
import type { SaveInput, SavedFilter, SavedItem, SyncItem } from '#/lib/saved'

export type Db = NodePgDatabase<typeof schema>

/** The app's db client, loaded lazily so importing this module (and the
 * route and server functions built on it) never opens a pool by itself. */
async function appDb(): Promise<Db> {
  const { db } = await import('#/db/index')
  return db
}

/** Single-user v1: every row has a null user_id (spec 004, Non-Goals). */
const owner = isNull(savedChunks.userId)

function filterWhere(filter: SavedFilter): SQL | undefined {
  return and(
    owner,
    filter.region
      ? arrayContains(savedChunks.regions, [filter.region])
      : undefined,
    filter.tag ? arrayContains(savedChunks.tags, [filter.tag]) : undefined,
  )
}

export function toItem(row: SavedChunk): SavedItem {
  return {
    id: row.id,
    kind: row.kind,
    source_text: row.sourceText,
    region_requested: row.regionRequested as SavedItem['region_requested'],
    pattern: row.pattern,
    surface: row.surface,
    gloss_en: row.glossEn,
    example_es: row.exampleEs,
    example_en: row.exampleEn,
    highlight:
      row.highlight?.length === 2 ? [row.highlight[0], row.highlight[1]] : null,
    register: row.register as SavedItem['register'],
    regions: row.regions as SavedItem['regions'],
    confidence: row.confidence as SavedItem['confidence'],
    notes: row.notes,
    tags: row.tags,
    prompt_version: row.promptVersion,
    created_at: row.createdAt.toISOString(),
  }
}

/** Insert, or do nothing if (surface, example_es) is already saved. Returns
 * the row id either way. */
export async function insertSaved(
  input: SaveInput,
  db?: Db,
): Promise<{ id: string }> {
  const conn = db ?? (await appDb())
  const inserted = await conn
    .insert(savedChunks)
    .values({
      kind: input.kind,
      sourceText: input.source_text,
      regionRequested: input.region_requested,
      pattern: input.pattern,
      surface: input.surface,
      glossEn: input.gloss_en,
      exampleEs: input.example_es,
      exampleEn: input.example_en,
      highlight: input.highlight,
      register: input.register,
      regions: input.regions,
      confidence: input.confidence,
      notes: input.notes,
      tags: deriveTags(input.regions, input.register),
      promptVersion: input.prompt_version,
    })
    .onConflictDoNothing()
    .returning({ id: savedChunks.id })
  if (inserted[0]) return inserted[0]
  const [existing] = await conn
    .select({ id: savedChunks.id })
    .from(savedChunks)
    .where(
      and(
        owner,
        eq(savedChunks.surface, input.surface),
        eq(savedChunks.exampleEs, input.example_es),
      ),
    )
  return existing
}

/** Count plus the keys of everything saved: drives "Saved · n" and the
 * cards' "Saved ✓". */
export async function savedIndex(
  db?: Db,
): Promise<{ count: number; keys: string[] }> {
  const conn = db ?? (await appDb())
  const rows = await conn
    .select({ surface: savedChunks.surface, exampleEs: savedChunks.exampleEs })
    .from(savedChunks)
    .where(owner)
  return {
    count: rows.length,
    keys: rows.map((row) => savedKey(row.surface, row.exampleEs)),
  }
}

/** Newest first, filtered by region and tag. */
export async function listSaved(
  filter: SavedFilter,
  db?: Db,
): Promise<SavedItem[]> {
  const conn = db ?? (await appDb())
  const rows = await conn
    .select()
    .from(savedChunks)
    .where(filterWhere(filter))
    .orderBy(desc(savedChunks.createdAt), desc(savedChunks.id))
  return rows.map(toItem)
}

export interface Cursor {
  createdAt: Date
  id: string
}

/** One page for the streamed export, keyset-paginated on (created_at, id)
 * in the same order as `listSaved`. */
export async function pageSaved(
  filter: SavedFilter,
  cursor: Cursor | null,
  limit: number,
  db?: Db,
): Promise<{ items: SavedItem[]; next: Cursor | null }> {
  const conn = db ?? (await appDb())
  const after = cursor
    ? or(
        lt(savedChunks.createdAt, cursor.createdAt),
        and(
          eq(savedChunks.createdAt, cursor.createdAt),
          lt(savedChunks.id, cursor.id),
        ),
      )
    : undefined
  const rows = await conn
    .select()
    .from(savedChunks)
    .where(and(filterWhere(filter), after))
    .orderBy(desc(savedChunks.createdAt), desc(savedChunks.id))
    .limit(limit)
  const last = rows.at(-1)
  return {
    items: rows.map(toItem),
    next:
      rows.length === limit && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  }
}

export async function deleteSaved(
  id: string,
  db?: Db,
): Promise<{ deleted: boolean }> {
  const conn = db ?? (await appDb())
  const rows = await conn
    .delete(savedChunks)
    .where(and(owner, eq(savedChunks.id, id)))
    .returning({ id: savedChunks.id })
  return { deleted: rows.length > 0 }
}

/** Write settled labels onto saved rows that are still `unrated`. Rows that
 * are not saved, or already settled, are left alone, so the call is safe to
 * repeat and to race with a save. Returns how many rows changed. */
export async function syncConfidence(
  items: SyncItem[],
  db?: Db,
): Promise<{ updated: number }> {
  if (items.length === 0) return { updated: 0 }
  const conn = db ?? (await appDb())
  let updated = 0
  for (const item of items) {
    const rows = await conn
      .update(savedChunks)
      .set({ confidence: item.confidence })
      .where(
        and(
          owner,
          eq(savedChunks.confidence, 'unrated'),
          eq(savedChunks.surface, item.surface),
          eq(savedChunks.exampleEs, item.example_es),
        ),
      )
      .returning({ id: savedChunks.id })
    updated += rows.length
  }
  return { updated }
}
