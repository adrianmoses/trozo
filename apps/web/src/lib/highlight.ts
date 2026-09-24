export interface HighlightSplit {
  before: string
  match: string
  after: string
}

/** Fold one character for accent- and case-insensitive matching while
 * preserving its UTF-16 length, so indices in the folded string map 1:1
 * back onto the original. Surrogate pairs are kept as-is. */
function foldChar(ch: string): string {
  if (ch.length !== 1) return ch
  const base = ch.normalize('NFD').charAt(0)
  const lower = base.toLowerCase()
  return lower.length === 1 ? lower : base
}

function fold(text: string): string {
  return Array.from(text).map(foldChar).join('')
}

export type Range = [start: number, end: number]

function validRange(
  text: string,
  range: number[] | null | undefined,
): Range | null {
  if (!Array.isArray(range) || range.length !== 2) return null
  const [start, end] = range
  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= text.length
  ) {
    return [start, end]
  }
  return null
}

/** Locate a chunk inside `text` as a `[start, end)` range. Prefers the
 * service-computed range; when it is missing, null or out of bounds, falls
 * back to an accent- and case-insensitive search for `surface`; returns null
 * when neither locates the chunk. (Service ranges are code-point based; for
 * BMP-only Spanish text they coincide with UTF-16 indices.) */
export function locateChunk(
  text: string,
  range: number[] | null | undefined,
  surface: string,
): Range | null {
  const given = validRange(text, range)
  if (given) return given
  const needle = fold(surface.trim())
  if (!needle) return null
  const idx = fold(text).indexOf(needle)
  return idx < 0 ? null : [idx, idx + needle.length]
}

/** Split `text` around one chunk so the UI can underline it, or null to
 * render plain text. */
export function splitHighlight(
  text: string,
  range: number[] | null | undefined,
  surface: string,
): HighlightSplit | null {
  const located = locateChunk(text, range, surface)
  if (!located) return null
  const [start, end] = located
  return {
    before: text.slice(0, start),
    match: text.slice(start, end),
    after: text.slice(end),
  }
}

export interface Segment {
  text: string
  highlighted: boolean
}

/** Cut `text` into plain and highlighted segments from several ranges (one
 * per chunk in the translation line). Ranges are sorted by start; a range
 * overlapping an earlier one is dropped rather than nested. Null ranges are
 * ignored. */
export function segmentText(
  text: string,
  ranges: Array<Range | null | undefined>,
): Segment[] {
  const sorted = ranges
    .filter((r): r is Range => Array.isArray(r))
    .sort((a, b) => a[0] - b[0])
  const segments: Segment[] = []
  let cursor = 0
  for (const [start, end] of sorted) {
    if (start < cursor) continue
    if (start > cursor)
      segments.push({ text: text.slice(cursor, start), highlighted: false })
    segments.push({ text: text.slice(start, end), highlighted: true })
    cursor = end
  }
  if (cursor < text.length)
    segments.push({ text: text.slice(cursor), highlighted: false })
  return segments
}
