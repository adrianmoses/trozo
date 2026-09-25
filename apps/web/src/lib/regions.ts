import type { Region } from '@trozo/schema'

/** Regions supported at launch, in display order. Must match the contract's
 * `Region` union; the exported check below fails to compile if it drifts. */
export const REGIONS = [
  'neutral',
  'ES',
  'MX',
  'AR',
  'CO',
] as const satisfies readonly Region[]

export const ALL_REGIONS_LISTED: Exclude<
  Region,
  (typeof REGIONS)[number]
> extends never
  ? true
  : false = true

/** Matches `ChunkRequest.text` maxLength in the contract. */
export const MAX_PHRASE_LENGTH = 200

export function isRegion(value: unknown): value is Region {
  return (
    typeof value === 'string' && (REGIONS as readonly string[]).includes(value)
  )
}
