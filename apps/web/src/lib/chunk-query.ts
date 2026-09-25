import { queryOptions } from '@tanstack/react-query'
import type { Region } from '@trozo/schema'
import { chunkFn } from '#/server/chunk.functions'

/** One result per (region, phrase). Results are deterministic per prompt
 * version and cached by the service, so they never go stale in a session;
 * this is what makes back/forward instant. Errors arrive as data
 * (`{ ok: false }`), never thrown, so the UI branches on them. */
export function chunkQueryOptions(input: { q: string; region: Region }) {
  return queryOptions({
    queryKey: ['chunk', input.region, input.q] as const,
    queryFn: () => chunkFn({ data: { text: input.q, region: input.region } }),
    enabled: input.q.length > 0,
    staleTime: Infinity,
    retry: false,
  })
}
