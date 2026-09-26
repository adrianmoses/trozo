import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { saveChunkFn, syncConfidenceFn } from '#/server/saved.functions'
import { testQueryClient } from '#/test/render'
import { chunkQueryKey } from './chunk-query'
import { savedKey, toSavedRow } from './saved'
import { SAVED_INDEX_KEY, useSaveMutation } from './saved-query'
import type { SavedIndex } from './saved-query'

vi.mock('#/server/saved.functions', () => ({
  saveChunkFn: vi.fn(),
  savedIndexFn: vi.fn(),
  listSavedFn: vi.fn(),
  deleteSavedFn: vi.fn(),
  syncConfidenceFn: vi.fn(),
}))
vi.mock('#/server/chunk.functions', () => ({
  chunkFn: vi.fn(),
  chunkFullFn: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const chunk = sampleResponse.chunks[0]
const alt = chunk.alternatives![0] // unrated in the fixture
const row = toSavedRow({ response: sampleResponse, region: 'ES' }, chunk, alt)
const key = savedKey(row.surface, row.example_es)
const input = { q: 'excited', region: 'ES' as const }

function setup() {
  const client = testQueryClient()
  client.setQueryData<SavedIndex>(SAVED_INDEX_KEY, { count: 0, keys: [] })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useSaveMutation(), { wrapper })
  return { client, hook }
}

beforeEach(() => {
  vi.mocked(saveChunkFn).mockReset()
  vi.mocked(syncConfidenceFn).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe('useSaveMutation', () => {
  it('marks the item saved optimistically', async () => {
    let resolve!: (v: { id: string }) => void
    vi.mocked(saveChunkFn).mockReturnValue(
      new Promise((r) => (resolve = r)) as never,
    )
    const { client, hook } = setup()
    act(() => hook.result.current.mutate(row))
    await waitFor(() =>
      expect(client.getQueryData<SavedIndex>(SAVED_INDEX_KEY)).toEqual({
        count: 1,
        keys: [key],
      }),
    )
    resolve({ id: 'x' })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  })

  it('rolls back and shows a toast when the save fails', async () => {
    vi.mocked(saveChunkFn).mockRejectedValue(new Error('db down'))
    const { client, hook } = setup()
    act(() => hook.result.current.mutate(row))
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(client.getQueryData<SavedIndex>(SAVED_INDEX_KEY)?.keys).toEqual([])
    expect(toast.error).toHaveBeenCalledWith('Save failed')
  })

  it('syncs when the label settled while the save was in flight', async () => {
    const { client, hook } = setup()
    client.setQueryData(chunkQueryKey(input), {
      ok: true,
      data: sampleResponse,
    })
    vi.mocked(saveChunkFn).mockImplementation(async () => {
      // Full confidence lands mid-save: the alternative settles to `med`.
      const settled = {
        ...sampleResponse,
        chunks: [
          {
            ...chunk,
            alternatives: [{ ...alt, confidence: { label: 'med' as const } }],
          },
        ],
      }
      client.setQueryData(chunkQueryKey(input), { ok: true, data: settled })
      return { id: 'x' }
    })
    act(() => hook.result.current.mutate(row))
    await waitFor(() => expect(syncConfidenceFn).toHaveBeenCalled())
    expect(syncConfidenceFn).toHaveBeenCalledWith({
      data: [
        { surface: row.surface, example_es: row.example_es, confidence: 'med' },
      ],
    })
  })

  it('does not sync when the label is still unrated', async () => {
    const { client, hook } = setup()
    client.setQueryData(chunkQueryKey(input), {
      ok: true,
      data: sampleResponse,
    })
    vi.mocked(saveChunkFn).mockResolvedValue({ id: 'x' })
    act(() => hook.result.current.mutate(row))
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(syncConfidenceFn).not.toHaveBeenCalled()
  })
})
