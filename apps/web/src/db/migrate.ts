// Applies the committed drizzle/ migrations to DATABASE_URL, then exits (006).
// Bundled by esbuild into a single migrate.mjs in the web runtime image, where
// Fly runs it as the release_command; there is no drizzle-kit in that image.
// Uses the same journal table as drizzle-kit, so `pnpm db:migrate` and this
// script are interchangeable.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL is not set')
  process.exit(1)
}

// Next to the script: /app/drizzle in the image, apps/web/drizzle from source.
const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? path.join(here, 'drizzle')

const pool = new Pool({
  connectionString: url,
  connectionTimeoutMillis: 10_000,
})
try {
  console.log(`[migrate] applying migrations from ${migrationsFolder}`)
  await migrate(drizzle(pool), { migrationsFolder })
  console.log('[migrate] done')
} catch (error) {
  console.error('[migrate] failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
