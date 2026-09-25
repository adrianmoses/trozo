import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { chunkFullFn } from '#/server/chunk.functions'
import {
  chunkFullQueryOptions,
  chunkQueryKey,
  needsFullConfidence,
} from './chunk-query'

vi.mock('#/server/chunk.functions', () => ({
  chunkFn: vi.fn(),
  chunkFullFn: vi.fn(),
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

beforeEach(() => vi.mocked(chunkFullFn).mockReset())

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
