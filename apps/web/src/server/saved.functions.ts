import { createServerFn } from '@tanstack/react-start'
import {
  validateId,
  validateSaveInput,
  validateSavedFilter,
  validateSyncInput,
} from '#/lib/saved'
import {
  deleteSaved,
  insertSaved,
  listSaved,
  savedIndex,
  syncConfidence,
} from '#/server/saved.server'

// Saved chunks (feature 004). None of these reach the chunk service or an
// LLM: they only read and write `saved_chunks`.

export const saveChunkFn = createServerFn({ method: 'POST' })
  .validator(validateSaveInput)
  .handler(({ data }) => insertSaved(data))

export const savedIndexFn = createServerFn({ method: 'GET' }).handler(() =>
  savedIndex(),
)

export const listSavedFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    validateSavedFilter((data ?? {}) as Record<string, unknown>),
  )
  .handler(({ data }) => listSaved(data))

export const deleteSavedFn = createServerFn({ method: 'POST' })
  .validator(validateId)
  .handler(({ data }) => deleteSaved(data.id))

/** Settled labels from a full-confidence result; only `unrated` saved rows
 * change. */
export const syncConfidenceFn = createServerFn({ method: 'POST' })
  .validator(validateSyncInput)
  .handler(({ data }) => syncConfidence(data))
