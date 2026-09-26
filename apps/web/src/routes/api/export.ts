import { createFileRoute } from '@tanstack/react-router'
import { isExportFormat } from '#/lib/export'
import { validateSavedFilter } from '#/lib/saved'
import { exportResponse } from '#/server/export.server'

export const Route = createFileRoute('/api/export')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const params = new URL(request.url).searchParams
        const format = params.get('format') ?? 'csv'
        if (!isExportFormat(format)) {
          return new Response('format must be csv, cloze or txt', {
            status: 400,
          })
        }
        return exportResponse(
          format,
          validateSavedFilter(Object.fromEntries(params)),
        )
      },
    },
  },
})
