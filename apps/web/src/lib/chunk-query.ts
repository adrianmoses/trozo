import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { ChunkResponse, Region } from '@trozo/schema'
import type { ChunkResult } from '#/lib/chunker.server'
import { savedKey, settledItems } from '#/lib/saved'
import { SAVED_INDEX_KEY, savedIndexQueryOptions } from '#/lib/saved-query'
import type { SavedIndex } from '#/lib/saved-query'
import { chunkFn, chunkFullFn } from '#/server/chunk.functions'
import { syncConfidenceFn } from '#/server/saved.functions'

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
 * back/forward navigation show settled labels without another request, and
 * saved items from this result get their settled labels (feature 004). This
 * runs in the query function, not a component, so it completes even after
 * the user has moved on. On failure the fast data is left untouched. */
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
        await syncSavedConfidence(result.data, queryClient)
      }
      return result
    },
    enabled: input.enabled && input.q.length > 0,
    staleTime: Infinity,
    retry: false,
  })
}

/** Push settled labels for any saved items in this result. Rows that are
 * already settled are left alone server-side, so this is safe to repeat. A
 * failure here never fails the full query: the rows just stay `unrated`. */
export async function syncSavedConfidence(
  data: ChunkResponse,
  queryClient: QueryClient,
): Promise<void> {
  try {
    const index =
      queryClient.getQueryData<SavedIndex>(SAVED_INDEX_KEY) ??
      (await queryClient.fetchQuery(savedIndexQueryOptions()))
    const saved = new Set(index.keys)
    const items = settledItems(data).filter((item) =>
      saved.has(savedKey(item.surface, item.example_es)),
    )
    if (items.length > 0) await syncConfidenceFn({ data: items })
  } catch {
    // Best effort; see above.
  }
}
