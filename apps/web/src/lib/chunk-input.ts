import type { Region } from '@trozo/schema'
import { MAX_PHRASE_LENGTH, isRegion } from '#/lib/regions'

export interface ChunkInput {
  text: string
  region: Region
}

/** Validator for the chunk server function: trims, enforces 1–200 chars,
 * and requires a supported region. Throws a plain Error with a message the
 * client can display. */
export function validateChunkInput(data: unknown): ChunkInput {
  if (typeof data !== 'object' || data === null) {
    throw new Error('invalid input')
  }
  const { text, region } = data as { text?: unknown; region?: unknown }
  if (typeof text !== 'string') throw new Error('text is required')
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('text is empty')
  if (trimmed.length > MAX_PHRASE_LENGTH) {
    throw new Error(`text exceeds ${MAX_PHRASE_LENGTH} characters`)
  }
  if (!isRegion(region)) throw new Error('unknown region')
  return { text: trimmed, region }
}
