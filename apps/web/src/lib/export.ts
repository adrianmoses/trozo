import type { SavedFilter, SavedItem } from '#/lib/saved'

// Export formats for saved chunks (feature 004). Pure line formatting; the
// streamed route lives in `routes/api/export.ts`.

export const EXPORT_FORMATS = ['csv', 'cloze', 'txt'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export function isExportFormat(value: unknown): value is ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat)
}

/** UTF-8 byte order mark: Excel needs it to read accents correctly. */
export const BOM = '﻿'
const EOL = '\r\n'

/** Anki note type and column names per CSV format. */
export const ANKI_NOTES: Record<
  Exclude<ExportFormat, 'txt'>,
  { notetype: string; columns: string[] }
> = {
  csv: { notetype: 'Basic', columns: ['Front', 'Back', 'Tags'] },
  cloze: { notetype: 'Cloze', columns: ['Text', 'Extra', 'Tags'] },
}

/** Anki file headers (Anki 2.1.54+) instead of a plain header row, which
 * Anki would import as a note. They fix the separator (Anki's guess can put
 * every field on Front), turn on HTML, pick the note type (an unknown name is
 * ignored and the import dialog asks), name the columns and send the third
 * to Tags. Anki strips the BOM before reading them. */
function ankiHeaders(format: Exclude<ExportFormat, 'txt'>): string {
  const { notetype, columns } = ANKI_NOTES[format]
  return [
    '#separator:Comma',
    '#html:true',
    `#notetype:${notetype}`,
    `#columns:${columns.join(',')}`,
    `#tags column:${columns.length}`,
  ]
    .map((line) => line + EOL)
    .join('')
}

/** RFC 4180: quote fields containing a comma, quote or line break, and
 * double embedded quotes. */
export function csvEscape(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field
}

export function csvLine(fields: string[]): string {
  return fields.map(csvEscape).join(',') + EOL
}

/** Anki fields are HTML ("Allow HTML in fields"), so text is escaped. */
function html(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** Where the chunk sits in `example_es`, as `[start, end)`: the stored
 * highlight for chunks, else the first case-insensitive match of the surface
 * (slot markers like "+ inf." dropped), else null. Conjugated variants often
 * do not match; see spec 004, Open Questions. */
export function chunkSpan(
  item: Pick<SavedItem, 'surface' | 'example_es' | 'highlight'>,
): [number, number] | null {
  const { highlight, example_es: es } = item
  if (highlight && highlight[0] < highlight[1] && highlight[1] <= es.length) {
    return highlight
  }
  const needle = item.surface
    .replace(/\s*\+.*$/, '')
    .trim()
    .toLowerCase()
  if (!needle) return null
  const start = es.toLowerCase().indexOf(needle)
  return start === -1 ? null : [start, start + needle.length]
}

function regionsText(item: Pick<SavedItem, 'regions'>): string {
  return item.regions.join(', ')
}

function footer(item: SavedItem): string {
  return `${html(item.pattern)} · ${html(regionsText(item))}`
}

/** Basic note: Front = English example, Back = Spanish example with the chunk
 * in <b>, then pattern and regions. */
export function formatBasicRow(item: SavedItem): string {
  const es = item.example_es
  const span = chunkSpan(item)
  const back = span
    ? `${html(es.slice(0, span[0]))}<b>${html(es.slice(span[0], span[1]))}</b>${html(es.slice(span[1]))}`
    : html(es)
  return csvLine([
    html(item.example_en ?? item.gloss_en ?? ''),
    `${back}<br>${footer(item)}`,
    item.tags.join(' '),
  ])
}

/** Cloze note: Text = Spanish example with the chunk as {{c1::…}}. When the
 * chunk cannot be located, the surface itself is the deletion so every row
 * still imports. */
export function formatClozeRow(item: SavedItem): string {
  const es = item.example_es
  const span = chunkSpan(item)
  const text = span
    ? `${html(es.slice(0, span[0]))}{{c1::${html(es.slice(span[0], span[1]))}}}${html(es.slice(span[1]))}`
    : `{{c1::${html(item.surface)}}} — ${html(es)}`
  const extra = [item.example_en ? html(item.example_en) : null, footer(item)]
    .filter(Boolean)
    .join('<br>')
  return csvLine([text, extra, item.tags.join(' ')])
}

/** `pattern — example_es — regions`, one item per line. */
export function formatTxtLine(item: SavedItem): string {
  return `${item.pattern} — ${item.example_es} — ${regionsText(item)}${EOL}`
}

export function formatRow(format: ExportFormat, item: SavedItem): string {
  if (format === 'csv') return formatBasicRow(item)
  if (format === 'cloze') return formatClozeRow(item)
  return formatTxtLine(item)
}

/** BOM, plus Anki file headers for the CSV formats. */
export function exportPreamble(format: ExportFormat): string {
  return format === 'txt' ? BOM : BOM + ankiHeaders(format)
}

export function exportFilename(format: ExportFormat, date: Date): string {
  const day = date.toISOString().slice(0, 10)
  if (format === 'txt') return `trozo-${day}.txt`
  return format === 'cloze' ? `trozo-${day}-cloze.csv` : `trozo-${day}.csv`
}

export function exportContentType(format: ExportFormat): string {
  return format === 'txt'
    ? 'text/plain; charset=utf-8'
    : 'text/csv; charset=utf-8'
}

/** Link to the export route, carrying the `/saved` filters. */
export function exportHref(format: ExportFormat, filter: SavedFilter): string {
  const params = new URLSearchParams({ format })
  if (filter.region) params.set('region', filter.region)
  if (filter.tag) params.set('tag', filter.tag)
  return `/api/export?${params.toString()}`
}
