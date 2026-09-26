import type {
  Alternative,
  Chunk,
  ChunkResponse,
  ConfidenceLabel,
  Note,
  Region,
  Register,
} from '@trozo/schema'
import { isRegion } from '#/lib/regions'

/** A saved item as it crosses the save server function. Tags are not part of
 * it: the server derives them with `deriveTags`, so the database, the
 * `/saved` filters and the export always agree. */
export interface SaveInput {
  kind: 'chunk' | 'variant'
  source_text: string
  region_requested: Region
  pattern: string
  surface: string
  gloss_en: string | null
  example_es: string
  example_en: string | null
  highlight: [number, number] | null
  register: Register | null
  regions: Region[]
  confidence: ConfidenceLabel
  notes: Note[]
  prompt_version: string | null
}

/** A settled label for one item, keyed the same way saved rows are. */
export interface SyncItem {
  surface: string
  example_es: string
  confidence: Exclude<ConfidenceLabel, 'unrated'>
}

export interface SavedFilter {
  region?: Region
  tag?: string
}

/** What a saved row looks like on the client (`/saved` and export). */
export interface SavedItem extends SaveInput {
  id: string
  tags: string[]
  created_at: string
}

/** Identity of a saved item. Chunk ids are only stable within one response;
 * surface + Spanish example stay stable across cached revisits. */
export function savedKey(surface: string, exampleEs: string): string {
  // JSON, not a control-character separator: keys travel through SSR
  // dehydration, and must stay unambiguous for any text.
  return JSON.stringify([surface, exampleEs])
}

/** `trozo`, one `region::R` per region, and `register::r`. */
export function deriveTags(
  regions: readonly Region[],
  register: Register | null,
): string[] {
  const tags = ['trozo', ...regions.map((region) => `region::${region}`)]
  if (register) tags.push(`register::${register}`)
  return tags
}

/** Build the save payload for a chunk card, or for one of its regional
 * variants. A variant keeps its own surface, example, regions, register and
 * confidence, and inherits the parent's pattern, gloss and English example
 * (Alternative has no `example.en`; both examples mirror the same input). */
export function toSavedRow(
  source: { response: ChunkResponse; region: Region },
  chunk: Chunk,
  alt?: Alternative,
): SaveInput {
  const { response, region } = source
  const notes = (response.notes ?? []).filter((note) =>
    note.applies_to?.includes(chunk.id),
  )
  const base = {
    source_text: response.input,
    region_requested: region,
    pattern: chunk.pattern,
    gloss_en: chunk.gloss_en,
    example_en: chunk.example.en,
    notes,
    prompt_version: response.meta.prompt_version,
  }
  if (alt) {
    return {
      ...base,
      kind: 'variant',
      surface: alt.surface,
      example_es: alt.example_es,
      highlight: null,
      register: alt.register ?? 'neutral',
      regions: alt.regions,
      confidence: alt.confidence.label,
    }
  }
  const highlight = chunk.example.highlight
  return {
    ...base,
    kind: 'chunk',
    surface: chunk.surface,
    example_es: chunk.example.es,
    highlight:
      highlight && highlight.length === 2 ? [highlight[0], highlight[1]] : null,
    register: chunk.register ?? 'neutral',
    regions: chunk.regions ?? ['neutral'],
    confidence: chunk.confidence.label,
  }
}

/** Every chunk and alternative in a response, with its key and label. */
function items(response: ChunkResponse) {
  return response.chunks.flatMap((chunk) => [
    {
      surface: chunk.surface,
      example_es: chunk.example.es,
      label: chunk.confidence.label,
    },
    ...(chunk.alternatives ?? []).map((alt) => ({
      surface: alt.surface,
      example_es: alt.example_es,
      label: alt.confidence.label,
    })),
  ])
}

/** Settled labels in a response, ready for `syncConfidenceFn`. */
export function settledItems(response: ChunkResponse): SyncItem[] {
  return items(response).flatMap(({ surface, example_es, label }) =>
    label === 'unrated' ? [] : [{ surface, example_es, confidence: label }],
  )
}

/** Current label of one item in a response, if it is there. */
export function findLabel(
  response: ChunkResponse,
  surface: string,
  exampleEs: string,
): ConfidenceLabel | undefined {
  return items(response).find(
    (item) => item.surface === surface && item.example_es === exampleEs,
  )?.label
}

// ---- validators (server function inputs and /saved search params) ----

const MAX_FIELD = 1000
const LABELS: readonly ConfidenceLabel[] = ['high', 'med', 'low', 'unrated']
const REGISTERS: readonly Register[] = ['coloquial', 'neutral', 'formal']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TAG = /^[\w:-]{1,64}$/

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`)
  }
  if (value.length > MAX_FIELD) throw new Error(`${field} is too long`)
  return value
}

function optionalText(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : text(value, field)
}

function isLabel(value: unknown): value is ConfidenceLabel {
  return LABELS.includes(value as ConfidenceLabel)
}

/** Validator for `saveChunkFn`. Throws a plain Error the client can show. */
export function validateSaveInput(data: unknown): SaveInput {
  if (typeof data !== 'object' || data === null) {
    throw new Error('invalid input')
  }
  const d = data as Record<string, unknown>
  if (d.kind !== 'chunk' && d.kind !== 'variant') {
    throw new Error('unknown kind')
  }
  if (!isRegion(d.region_requested)) throw new Error('unknown region')
  if (
    !Array.isArray(d.regions) ||
    d.regions.length === 0 ||
    !d.regions.every(isRegion)
  ) {
    throw new Error('regions are invalid')
  }
  if (d.register !== null && !REGISTERS.includes(d.register as Register)) {
    throw new Error('unknown register')
  }
  if (!isLabel(d.confidence)) throw new Error('unknown confidence')
  let highlight: [number, number] | null = null
  if (d.highlight !== null && d.highlight !== undefined) {
    const h = d.highlight
    if (
      !Array.isArray(h) ||
      h.length !== 2 ||
      !h.every((n) => Number.isInteger(n) && n >= 0) ||
      h[0] >= h[1]
    ) {
      throw new Error('highlight is invalid')
    }
    highlight = [h[0], h[1]]
  }
  if (!Array.isArray(d.notes) || d.notes.length > 20) {
    throw new Error('notes are invalid')
  }
  return {
    kind: d.kind,
    source_text: text(d.source_text, 'source_text'),
    region_requested: d.region_requested,
    pattern: text(d.pattern, 'pattern'),
    surface: text(d.surface, 'surface'),
    gloss_en: optionalText(d.gloss_en, 'gloss_en'),
    example_es: text(d.example_es, 'example_es'),
    example_en: optionalText(d.example_en, 'example_en'),
    highlight,
    register: d.register as Register | null,
    regions: [...new Set(d.regions)],
    confidence: d.confidence,
    notes: d.notes as Note[],
    prompt_version: optionalText(d.prompt_version, 'prompt_version'),
  }
}

/** Validator for `syncConfidenceFn`: settled labels only. */
export function validateSyncInput(data: unknown): SyncItem[] {
  if (!Array.isArray(data) || data.length > 200) {
    throw new Error('invalid input')
  }
  return data.map((item: unknown) => {
    const d = (item ?? {}) as Record<string, unknown>
    if (!isLabel(d.confidence) || d.confidence === 'unrated') {
      throw new Error('confidence must be settled')
    }
    return {
      surface: text(d.surface, 'surface'),
      example_es: text(d.example_es, 'example_es'),
      confidence: d.confidence,
    }
  })
}

/** `validateSearch` for `/saved` and the filter for list/export. Unknown or
 * malformed values are dropped rather than rejected. */
export function validateSavedFilter(
  search: Record<string, unknown>,
): SavedFilter {
  const out: SavedFilter = {}
  if (isRegion(search.region)) out.region = search.region
  if (typeof search.tag === 'string' && TAG.test(search.tag)) {
    out.tag = search.tag
  }
  return out
}

export function validateId(data: unknown): { id: string } {
  const id = (data as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('invalid id')
  return { id }
}
