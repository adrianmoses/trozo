import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ChunkResult } from '#/lib/chunker.server'
import { findLabel, savedKey } from '#/lib/saved'
import type { SaveInput, SavedFilter, SyncItem } from '#/lib/saved'
import {
  deleteSavedFn,
  listSavedFn,
  saveChunkFn,
  savedIndexFn,
  syncConfidenceFn,
} from '#/server/saved.functions'

export interface SavedIndex {
  count: number
  keys: string[]
}

export const SAVED_INDEX_KEY = ['saved-index'] as const

/** Count and keys of everything saved. Mounted by the header on every page,
 * so cards and the confidence sync can read it from the cache. */
export function savedIndexQueryOptions() {
  return queryOptions({
    queryKey: SAVED_INDEX_KEY,
    queryFn: () => savedIndexFn(),
    staleTime: Infinity,
  })
}

export function savedListQueryOptions(filter: SavedFilter) {
  return queryOptions({
    queryKey: ['saved', filter.region ?? null, filter.tag ?? null] as const,
    queryFn: () => listSavedFn({ data: filter }),
  })
}

/** The item's current label in any cached chunk result, if it has settled.
 * Used after a save lands: full confidence may have settled while the save
 * was in flight, after the sync for that result already ran. */
function settledLabelInCache(
  queryClient: QueryClient,
  row: SaveInput,
): SyncItem['confidence'] | undefined {
  for (const [, result] of queryClient.getQueriesData<ChunkResult>({
    queryKey: ['chunk'],
  })) {
    if (!result?.ok) continue
    const label = findLabel(result.data, row.surface, row.example_es)
    if (label && label !== 'unrated') return label
  }
  return undefined
}

function invalidateSaved(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: SAVED_INDEX_KEY })
  void queryClient.invalidateQueries({ queryKey: ['saved'] })
}

/** Save a chunk or variant. "Saved ✓" shows optimistically; on failure it
 * rolls back and a toast explains. */
export function useSaveMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (row: SaveInput) => saveChunkFn({ data: row }),
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: SAVED_INDEX_KEY })
      const previous = queryClient.getQueryData<SavedIndex>(SAVED_INDEX_KEY)
      const key = savedKey(row.surface, row.example_es)
      if (previous && !previous.keys.includes(key)) {
        queryClient.setQueryData<SavedIndex>(SAVED_INDEX_KEY, {
          count: previous.count + 1,
          keys: [...previous.keys, key],
        })
      }
      return { previous }
    },
    onError: (error, _row, context) => {
      // Server-function errors arrive as a 200 with the error serialized in
      // the body; log the cause, the toast stays short.
      console.error('Save failed:', error)
      if (context?.previous) {
        queryClient.setQueryData(SAVED_INDEX_KEY, context.previous)
      }
      toast.error('Save failed')
    },
    onSuccess: async (_result, row) => {
      if (row.confidence !== 'unrated') return
      const label = settledLabelInCache(queryClient, row)
      if (!label) return
      try {
        await syncConfidenceFn({
          data: [
            {
              surface: row.surface,
              example_es: row.example_es,
              confidence: label,
            },
          ],
        })
      } catch {
        // The row keeps `unrated`; nothing on screen depends on it.
      }
    },
    onSettled: () => invalidateSaved(queryClient),
  })
}

export function useDeleteSaved() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSavedFn({ data: { id } }),
    onError: (error) => {
      console.error('Delete failed:', error)
      toast.error('Delete failed')
    },
    onSettled: () => invalidateSaved(queryClient),
  })
}
