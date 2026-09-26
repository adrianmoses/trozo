import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// App-local env files first, then the repo root's (where honcho reads them).
config({ path: ['.env.local', '.env', '../../.env.local', '../../.env'] })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
