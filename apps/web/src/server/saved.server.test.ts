// @vitest-environment node
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sampleResponse } from '@trozo/schema/test/fixture'
import * as schema from '#/db/schema'
import { toSavedRow } from '#/lib/saved'
import type { SaveInput } from '#/lib/saved'
import {
  deleteSaved,
  insertSaved,
  listSaved,
  pageSaved,
  savedIndex,
  syncConfidence,
} from './saved.server'
import type { Db } from './saved.server'

// Runs against a real Postgres (15+): set TEST_DATABASE_URL, e.g.
// postgres://trozo:trozo@localhost:5432/trozo. Each run migrates a throwaway
// schema and drops it afterwards. Skipped when the variable is unset.
const url = process.env.TEST_DATABASE_URL
const schemaName = `test_${randomUUID().replaceAll('-', '').slice(0, 12)}`

const chunk = sampleResponse.chunks[0]
const source = { response: sampleResponse, region: 'neutral' as const }
const chunkRow = toSavedRow(source, chunk)
const variantRow = toSavedRow(source, chunk, chunk.alternatives![0])

function row(overrides: Partial<SaveInput>): SaveInput {
  return { ...chunkRow, ...overrides }
}

describe.skipIf(!url)('saved.server (Postgres)', () => {
  let pool: Pool
  let db: Db

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url })
    await admin.query(`create schema ${schemaName}`)
    await admin.end()
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schemaName}`,
    })
    db = drizzle(pool, { schema })
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, '../../drizzle'),
      migrationsSchema: schemaName,
    })
  })

  beforeEach(async () => {
    await pool.query('truncate saved_chunks')
  })

  afterAll(async () => {
    await pool.query(`drop schema ${schemaName} cascade`)
    await pool.end()
  })

  it('saves once: a repeat save returns the same id and adds nothing', async () => {
    const first = await insertSaved(chunkRow, db)
    const again = await insertSaved({ ...chunkRow, confidence: 'low' }, db)
    expect(again.id).toBe(first.id)
    const index = await savedIndex(db)
    expect(index.count).toBe(1)
    const [saved] = await listSaved({}, db)
    expect(saved.confidence).toBe('high')
    expect(saved.tags).toEqual([
      'trozo',
      'region::neutral',
      'register::neutral',
    ])
    expect(saved.highlight).toEqual([0, 21])
    expect(saved.notes).toHaveLength(1)
  })

  it('stores a variant as its own row', async () => {
    await insertSaved(chunkRow, db)
    await insertSaved(variantRow, db)
    const items = await listSaved({}, db)
    expect(items.map((i) => i.kind).sort()).toEqual(['chunk', 'variant'])
  })

  it('syncs settled labels onto unrated rows only', async () => {
    await insertSaved(variantRow, db) // unrated
    await insertSaved(row({ surface: 'otro', confidence: 'low' }), db)
    const result = await syncConfidence(
      [
        {
          surface: variantRow.surface,
          example_es: variantRow.example_es,
          confidence: 'med',
        },
        {
          surface: 'otro',
          example_es: chunkRow.example_es,
          confidence: 'high',
        },
        { surface: 'not saved', example_es: 'x', confidence: 'high' },
      ],
      db,
    )
    expect(result.updated).toBe(1)
    const bySurface = Object.fromEntries(
      (await listSaved({}, db)).map((i) => [i.surface, i.confidence]),
    )
    expect(bySurface).toEqual({ [variantRow.surface]: 'med', otro: 'low' })
    // Repeating is a no-op.
    expect(
      (
        await syncConfidence(
          [
            {
              surface: variantRow.surface,
              example_es: variantRow.example_es,
              confidence: 'high',
            },
          ],
          db,
        )
      ).updated,
    ).toBe(0)
  })

  it('filters by region and tag, newest first', async () => {
    await insertSaved(row({ surface: 'a', regions: ['MX'] }), db)
    await insertSaved(
      row({ surface: 'b', regions: ['ES', 'MX'], register: 'coloquial' }),
      db,
    )
    await insertSaved(row({ surface: 'c', regions: ['AR'] }), db)
    expect((await listSaved({}, db)).map((i) => i.surface)).toEqual([
      'c',
      'b',
      'a',
    ])
    expect(
      (await listSaved({ region: 'MX' }, db)).map((i) => i.surface),
    ).toEqual(['b', 'a'])
    expect(
      (await listSaved({ tag: 'register::coloquial' }, db)).map(
        (i) => i.surface,
      ),
    ).toEqual(['b'])
    expect(
      await listSaved({ region: 'AR', tag: 'register::coloquial' }, db),
    ).toEqual([])
  })

  it('pages with a keyset cursor, covering every row exactly once', async () => {
    // Same created_at for several rows exercises the id tiebreak.
    for (let i = 0; i < 7; i++) {
      await insertSaved(row({ surface: `s${i}` }), db)
    }
    await pool.query(
      `update saved_chunks set created_at = '2026-09-26T10:00:00Z' where surface in ('s1','s2','s3')`,
    )
    const seen: string[] = []
    let cursor = null
    let pages = 0
    do {
      const page = await pageSaved({}, cursor, 3, db)
      seen.push(...page.items.map((i) => i.surface))
      cursor = page.next
      pages++
    } while (cursor && pages < 10)
    expect(seen.sort()).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6'])
  })

  it('deletes by id', async () => {
    const { id } = await insertSaved(chunkRow, db)
    expect(await deleteSaved(id, db)).toEqual({ deleted: true })
    expect(await deleteSaved(id, db)).toEqual({ deleted: false })
    expect((await savedIndex(db)).count).toBe(0)
  })
})
