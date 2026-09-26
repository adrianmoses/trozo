import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type { Note } from '@trozo/schema'

/** Chunks and regional variants the user saved (feature 004). One row is one
 * Anki card. Identity is (user_id, surface, example_es) with nulls not
 * distinct, so single-user saves (user_id null) still deduplicate; this needs
 * Postgres 15+. */
export const savedChunks = pgTable(
  'saved_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    kind: text('kind').notNull().$type<'chunk' | 'variant'>(),
    sourceText: text('source_text').notNull(),
    regionRequested: text('region_requested').notNull(),
    pattern: text('pattern').notNull(),
    surface: text('surface').notNull(),
    glossEn: text('gloss_en'),
    exampleEs: text('example_es').notNull(),
    exampleEn: text('example_en'),
    /** `[start, end)` of the chunk inside `example_es`; chunks only. */
    highlight: integer('highlight').array(),
    register: text('register'),
    regions: text('regions')
      .array()
      .notNull()
      .default(sql`'{neutral}'`),
    confidence: text('confidence').notNull(),
    notes: jsonb('notes').$type<Note[]>().notNull().default([]),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'`),
    feedback: smallint('feedback').notNull().default(0),
    promptVersion: text('prompt_version'),
    // Millisecond precision so a JS Date round-trips exactly; the export's
    // keyset cursor compares on it.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('saved_chunks_identity')
      .on(t.userId, t.surface, t.exampleEs)
      .nullsNotDistinct(),
    index('saved_chunks_regions_idx').using('gin', t.regions),
    index('saved_chunks_tags_idx').using('gin', t.tags),
    index('saved_chunks_created_idx').on(t.createdAt.desc(), t.id.desc()),
    check('saved_chunks_kind_check', sql`${t.kind} in ('chunk', 'variant')`),
    check(
      'saved_chunks_register_check',
      sql`${t.register} in ('coloquial', 'neutral', 'formal')`,
    ),
    check(
      'saved_chunks_confidence_check',
      sql`${t.confidence} in ('high', 'med', 'low', 'unrated')`,
    ),
    check('saved_chunks_feedback_check', sql`${t.feedback} in (-1, 0, 1)`),
  ],
)

export type SavedChunk = typeof savedChunks.$inferSelect
export type NewSavedChunk = typeof savedChunks.$inferInsert
