import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { chunkFullFn } from '#/server/chunk.functions'
import { savedIndexFn, syncConfidenceFn } from '#/server/saved.functions'
import {
  chunkFullQueryOptions,
  chunkQueryKey,
  needsFullConfidence,
} from './chunk-query'
import { savedKey } from './saved'
import { SAVED_INDEX_KEY } from './saved-query'

vi.mock('#/server/chunk.functions', () => ({
  chunkFn: vi.fn(),
  chunkFullFn: vi.fn(),
}))
vi.mock('#/server/saved.functions', () => ({
  saveChunkFn: vi.fn(),
  savedIndexFn: vi.fn(),
  listSavedFn: vi.fn(),
  deleteSavedFn: vi.fn(),
  syncConfidenceFn: vi.fn(),
}))

const unrated = {
  ...sampleResponse,
  chunks: [
    {
      ...sampleResponse.chunks[0],
      confidence: { label: 'unrated' as const },
    },
  ],
}
const settled = {
  ...unrated,
  chunks: [
    {
      ...unrated.chunks[0],
      confidence: {
        label: 'high' as const,
        signals: { seed: false, consistency: 1, verifier: 'agree' },
      },
      alternatives: [],
    },
  ],
}
const input = { q: 'I miss you', region: 'MX' as const }

beforeEach(() => {
  vi.mocked(chunkFullFn).mockReset()
  vi.mocked(syncConfidenceFn).mockReset()
  vi.mocked(savedIndexFn).mockReset()
  vi.mocked(savedIndexFn).mockResolvedValue({ count: 0, keys: [] })
})

describe('needsFullConfidence', () => {
  it('only for ok results that still have an unrated chunk or alternative', () => {
    expect(needsFullConfidence(undefined)).toBe(false)
    expect(
      needsFullConfidence({
        ok: false,
        error: { status: 502, code: 'x', message: 'y' },
      }),
    ).toBe(false)
    expect(needsFullConfidence({ ok: true, data: unrated })).toBe(true)
    expect(needsFullConfidence({ ok: true, data: settled })).toBe(false)
    // sampleResponse: chunk verified, but its alternative is unrated
    expect(needsFullConfidence({ ok: true, data: sampleResponse })).toBe(true)
    expect(
      needsFullConfidence({ ok: true, data: { ...unrated, chunks: [] } }),
    ).toBe(false)
  })
})

describe('chunkFullQueryOptions', () => {
  it('patches the fast cache entry with the settled result', async () => {
    const client = new QueryClient()
    client.setQueryData(chunkQueryKey(input), { ok: true, data: unrated })
    vi.mocked(chunkFullFn).mockResolvedValue({ ok: true, data: settled })

    const options = chunkFullQueryOptions({ ...input, enabled: true }, client)
    await client.fetchQuery(options)

    expect(chunkFullFn).toHaveBeenCalledWith({
      data: { text: 'I miss you', region: 'MX' },
    })
    expect(client.getQueryData(chunkQueryKey(input))).toEqual({
      ok: true,
      data: settled,
    })
  })

  it('leaves the fast entry untouched when full confidence fails', async () => {
    const client = new QueryClient()
    client.setQueryData(chunkQueryKey(input), { ok: true, data: unrated })
    vi.mocked(chunkFullFn).mockResolvedValue({
      ok: false,
      error: { status: 502, code: 'llm_failure', message: 'down' },
    })

    await client.fetchQuery(
      chunkFullQueryOptions({ ...input, enabled: true }, client),
    )
    expect(client.getQueryData(chunkQueryKey(input))).toEqual({
      ok: true,
      data: unrated,
    })
  })

  it('is disabled until asked and for an empty phrase', () => {
    const client = new QueryClient()
    expect(
      chunkFullQueryOptions({ ...input, enabled: false }, client).enabled,
    ).toBe(false)
    expect(
      chunkFullQueryOptions({ q: '', region: 'MX', enabled: true }, client)
        .enabled,
    ).toBe(false)
  })
})

describe('saved confidence sync (feature 004)', () => {
  const chunk = settled.chunks[0]
  const chunkKey = savedKey(chunk.surface, chunk.example.es)
  // A settled result with one settled chunk and one settled alternative.
  const withAlt = {
    ...settled,
    chunks: [
      {
        ...chunk,
        alternatives: [
          {
            surface: 'extrañar',
            example_es: 'Te extraño.',
            regions: ['MX' as const],
            confidence: { label: 'med' as const },
          },
          {
            surface: 'añorar',
            example_es: 'Te añoro.',
            regions: ['ES' as const],
            confidence: { label: 'unrated' as const },
          },
        ],
      },
    ],
  }

  async function runFull(client: QueryClient, data = withAlt) {
    client.setQueryData(chunkQueryKey(input), { ok: true, data: unrated })
    vi.mocked(chunkFullFn).mockResolvedValue({ ok: true, data })
    return client.fetchQuery(
      chunkFullQueryOptions({ ...input, enabled: true }, client),
    )
  }

  it('sends settled labels for saved items only', async () => {
    const client = new QueryClient()
    client.setQueryData(SAVED_INDEX_KEY, {
      count: 3,
      keys: [
        chunkKey,
        savedKey('extrañar', 'Te extraño.'),
        savedKey('añorar', 'Te añoro.'),
      ],
    })
    await runFull(client)
    expect(syncConfidenceFn).toHaveBeenCalledWith({
      data: [
        {
          surface: chunk.surface,
          example_es: chunk.example.es,
          confidence: 'high',
        },
        { surface: 'extrañar', example_es: 'Te extraño.', confidence: 'med' },
      ],
    })
  })

  it('does not call sync when nothing in the result is saved', async () => {
    const client = new QueryClient()
    client.setQueryData(SAVED_INDEX_KEY, { count: 1, keys: ['other'] })
    await runFull(client)
    expect(syncConfidenceFn).not.toHaveBeenCalled()
  })

  it('fetches the saved index when it is not cached yet', async () => {
    const client = new QueryClient()
    vi.mocked(savedIndexFn).mockResolvedValue({ count: 1, keys: [chunkKey] })
    await runFull(client)
    expect(savedIndexFn).toHaveBeenCalled()
    expect(syncConfidenceFn).toHaveBeenCalledTimes(1)
  })

  it('does not call sync when full confidence fails', async () => {
    const client = new QueryClient()
    client.setQueryData(SAVED_INDEX_KEY, { count: 1, keys: [chunkKey] })
    vi.mocked(chunkFullFn).mockResolvedValue({
      ok: false,
      error: { status: 502, code: 'llm_failure', message: 'down' },
    })
    await client.fetchQuery(
      chunkFullQueryOptions({ ...input, enabled: true }, client),
    )
    expect(syncConfidenceFn).not.toHaveBeenCalled()
  })

  it('a sync failure leaves the full result intact', async () => {
    const client = new QueryClient()
    client.setQueryData(SAVED_INDEX_KEY, { count: 1, keys: [chunkKey] })
    vi.mocked(syncConfidenceFn).mockRejectedValue(new Error('db down'))
    const result = await runFull(client)
    expect(result).toEqual({ ok: true, data: withAlt })
    expect(client.getQueryData(chunkQueryKey(input))).toEqual({
      ok: true,
      data: withAlt,
    })
  })
})
