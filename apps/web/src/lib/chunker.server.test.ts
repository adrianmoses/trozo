import { describe, expect, it, vi } from 'vitest'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { chunkPhrase, chunkerConfig } from './chunker.server'

function fakeFetch(
  status: number,
  body: unknown,
  opts: { json?: boolean } = {},
) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `status ${status}`,
        json: async () => {
          if (opts.json === false) throw new Error('not json')
          return body
        },
      } as unknown as Response
    },
  )
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

const input = { text: 'I miss you', region: 'MX' as const }

describe('chunkerConfig', () => {
  it('defaults to localhost and strips a trailing slash', () => {
    expect(chunkerConfig({})).toEqual({
      baseUrl: 'http://localhost:8000',
      token: undefined,
    })
    expect(chunkerConfig({ CHUNKER_URL: 'http://chunker:8000/' }).baseUrl).toBe(
      'http://chunker:8000',
    )
  })

  it('treats an empty token as unset', () => {
    expect(chunkerConfig({ CHUNKER_TOKEN: '' }).token).toBeUndefined()
    expect(chunkerConfig({ CHUNKER_TOKEN: 's3cret' }).token).toBe('s3cret')
  })
})

describe('chunkPhrase', () => {
  it('posts a fast-mode request and returns the typed response', async () => {
    const { fetchImpl, calls } = fakeFetch(200, sampleResponse)
    const result = await chunkPhrase(input, { fetch: fetchImpl, env: {} })
    expect(result).toEqual({ ok: true, data: sampleResponse })
    expect(calls[0].url).toBe('http://localhost:8000/v1/chunk')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      text: 'I miss you',
      preferred_region: 'MX',
      confidence_mode: 'fast',
    })
    expect(calls[0].init.headers).not.toHaveProperty('authorization')
  })

  it('sends the bearer header exactly when CHUNKER_TOKEN is set', async () => {
    const { fetchImpl, calls } = fakeFetch(200, sampleResponse)
    await chunkPhrase(input, {
      fetch: fetchImpl,
      env: { CHUNKER_TOKEN: 's3cret' },
    })
    expect(calls[0].init.headers).toMatchObject({
      authorization: 'Bearer s3cret',
    })
  })

  it.each([
    [422, 'invalid_input', 'input is empty'],
    [502, 'llm_failure', 'upstream boom'],
    [503, 'llm_rate_limited', 'slow down'],
  ])(
    'maps a %i error body to status, code and message',
    async (status, code, message) => {
      const { fetchImpl } = fakeFetch(status, { error: { code, message } })
      const result = await chunkPhrase(input, { fetch: fetchImpl, env: {} })
      expect(result).toEqual({ ok: false, error: { status, code, message } })
    },
  )

  it('maps a non-JSON failure to a generic http error', async () => {
    const { fetchImpl } = fakeFetch(500, null, { json: false })
    const result = await chunkPhrase(input, { fetch: fetchImpl, env: {} })
    expect(result).toEqual({
      ok: false,
      error: {
        status: 500,
        code: 'http_error',
        message: 'chunk service returned 500',
      },
    })
  })

  it('maps a rejected fetch to status 0 / network', async () => {
    const fetchImpl = (async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch
    const result = await chunkPhrase(input, { fetch: fetchImpl, env: {} })
    expect(result).toEqual({
      ok: false,
      error: { status: 0, code: 'network', message: 'fetch failed' },
    })
  })
})
