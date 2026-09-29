import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

// Production uses Neon's pooled URL with sslmode=verify-full (006); TLS comes
// from the URL, so there is no production branch here. The timeout turns a
// stuck connect (e.g. a waking compute that never answers) into an error.
export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 10_000,
  },
  schema,
})
