import {
  exportContentType,
  exportFilename,
  exportPreamble,
  formatRow,
} from '#/lib/export'
import type { ExportFormat } from '#/lib/export'
import type { SavedFilter } from '#/lib/saved'
import { pageSaved } from '#/server/saved.server'
import type { Cursor } from '#/server/saved.server'

const PAGE_SIZE = 500

/** Stream saved chunks as Anki Basic CSV, Anki Cloze CSV or TXT: BOM, header
 * row, then rows read page by page from Postgres. Reads `saved_chunks` only;
 * never the chunk service. */
export function exportResponse(
  format: ExportFormat,
  filter: SavedFilter,
  now: Date = new Date(),
): Response {
  const encoder = new TextEncoder()
  let cursor: Cursor | null = null
  let started = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true
        controller.enqueue(encoder.encode(exportPreamble(format)))
      }
      const page = await pageSaved(filter, cursor, PAGE_SIZE)
      if (page.items.length > 0) {
        const chunk = page.items.map((item) => formatRow(format, item)).join('')
        controller.enqueue(encoder.encode(chunk))
      }
      cursor = page.next
      if (!cursor) controller.close()
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': exportContentType(format),
      'Content-Disposition': `attachment; filename="${exportFilename(format, now)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
