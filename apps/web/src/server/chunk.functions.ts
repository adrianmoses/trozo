import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import type { Region } from '@trozo/schema'
import { chunkPhrase } from '#/lib/chunker.server'
import type { ChunkResult } from '#/lib/chunker.server'
import { validateChunkInput } from '#/lib/chunk-input'
import { isRegion } from '#/lib/regions'

export const REGION_COOKIE = 'trozo_region'
const ONE_YEAR = 60 * 60 * 24 * 365

/** Fast-mode chunk request. Returns a discriminated result instead of
 * throwing so status and code survive the RPC boundary intact. On success the
 * chosen region is remembered in a cookie for the next visit. */
export const chunkFn = createServerFn({ method: 'POST' })
  .validator(validateChunkInput)
  .handler(async ({ data }): Promise<ChunkResult> => {
    const result = await chunkPhrase(data)
    if (result.ok) {
      setCookie(REGION_COOKIE, data.region, {
        sameSite: 'lax',
        path: '/',
        maxAge: ONE_YEAR,
      })
    }
    return result
  })

/** Full-confidence rescoring of the same phrase: same chunks, settled labels.
 * Runs in the background after the fast result; no cookie write. */
export const chunkFullFn = createServerFn({ method: 'POST' })
  .validator(validateChunkInput)
  .handler(async ({ data }): Promise<ChunkResult> =>
    chunkPhrase({ ...data, confidenceMode: 'full' }),
  )

/** Region remembered from the last successful request, or `neutral`. Read
 * server-side so the initial selector value matches between SSR and client. */
export const getPreferredRegion = createServerFn().handler(
  async (): Promise<Region> => {
    const value = getCookie(REGION_COOKIE)
    return isRegion(value) ? value : 'neutral'
  },
)
