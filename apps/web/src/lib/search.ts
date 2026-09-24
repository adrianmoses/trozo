import type { Region } from '@trozo/schema'
import { MAX_PHRASE_LENGTH, isRegion } from '#/lib/regions'

export interface TranslatorSearch {
  q?: string
  region?: Region
}

/** `validateSearch` for the translator route. Unknown keys are dropped, `q`
 * is trimmed and capped, an unknown region is omitted (the loader's default
 * then applies). Kept as a plain function: two fields do not justify zod. */
export function validateTranslatorSearch(
  search: Record<string, unknown>,
): TranslatorSearch {
  const out: TranslatorSearch = {}
  if (typeof search.q === 'string') {
    const q = search.q.trim().slice(0, MAX_PHRASE_LENGTH)
    if (q) out.q = q
  }
  if (isRegion(search.region)) out.region = search.region
  return out
}
