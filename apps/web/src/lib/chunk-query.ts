import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { ChunkResponse, Region } from '@trozo/schema'
import type { ChunkResult } from '#/lib/chunker.server'
import { chunkFn, chunkFullFn } from '#/server/chunk.functions'

type Input = { q: string; region: Region }

export function chunkQueryKey(input: Input) {
  return ['chunk', input.region, input.q] as const
}

/** One result per (region, phrase). Results are deterministic per prompt
 * version and cached by the service, so they never go stale in a session;
 * this is what makes back/forward instant. Errors arrive as data
 * (`{ ok: false }`), never thrown, so the UI branches on them. */
export function chunkQueryOptions(input: Input) {
  return queryOptions({
    queryKey: chunkQueryKey(input),
    queryFn: () => chunkFn({ data: { text: input.q, region: input.region } }),
    enabled: input.q.length > 0,
    staleTime: Infinity,
    retry: false,
  })
}

/** Does this fast result still have labels full confidence could settle? */
export function needsFullConfidence(result: ChunkResult | undefined): boolean {
  if (!result?.ok) return false
  return hasUnrated(result.data)
}

export function hasUnrated(data: ChunkResponse): boolean {
  return data.chunks.some(
    (chunk) =>
      chunk.confidence.label === 'unrated' ||
      (chunk.alternatives ?? []).some(
        (alt) => alt.confidence.label === 'unrated',
      ),
  )
}

/** Background full-confidence call (feature 003). On success it writes the
 * settled result into the fast query's cache entry, so the page and later
 * back/forward navigation show settled labels without another request. On
 * failure the fast data is left untouched. */
export function chunkFullQueryOptions(
  input: Input & { enabled: boolean },
  queryClient: QueryClient,
) {
  return queryOptions({
    queryKey: ['chunk-full', input.region, input.q] as const,
    queryFn: async () => {
      const result = await chunkFullFn({
        data: { text: input.q, region: input.region },
      })
      if (result.ok) {
        queryClient.setQueryData<ChunkResult>(chunkQueryKey(input), result)
      }
      return result
    },
    enabled: input.enabled && input.q.length > 0,
    staleTime: Infinity,
    retry: false,
  })
}
