import { createFileRoute } from '@tanstack/react-router'

// Liveness only (006): never touches Postgres or the chunk service, so Fly's
// health checks don't keep a scaled-to-zero Neon compute awake. Exempt from
// the Access check in src/start.ts.
export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'ok' }),
    },
  },
})
