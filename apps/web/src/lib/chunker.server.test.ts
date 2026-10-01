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

  it('sends confidence_mode full when asked', async () => {
    const { fetchImpl, calls } = fakeFetch(200, sampleResponse)
    await chunkPhrase(
      { ...input, confidenceMode: 'full' },
      { fetch: fetchImpl, env: {} },
    )
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      confidence_mode: 'full',
    })
  })
})

describe('chunkPhrase logging', () => {
  const env = { CHUNKER_TOKEN: 'tok-secret-123' }

  function logged(log: ReturnType<typeof vi.fn>) {
    expect(log).toHaveBeenCalledTimes(1)
    const [line, level] = log.mock.calls[0] as [string, string]
    return { line, level, fields: JSON.parse(line) as Record<string, unknown> }
  }

  it('logs one info line with status, latency, cache flag and dropped count', async () => {
    const { fetchImpl } = fakeFetch(200, sampleResponse)
    const log = vi.fn()
    await chunkPhrase(input, { fetch: fetchImpl, env, log })
    const { level, fields } = logged(log)
    expect(level).toBe('info')
    expect(fields).toMatchObject({
      event: 'chunker_call',
      fn: 'chunkFn',
      status: 200,
      cache_hit: sampleResponse.meta.cached,
      dropped: sampleResponse.meta.dropped?.length ?? 0,
    })
    expect(typeof fields.latency_ms).toBe('number')
  })

  it('names chunkFullFn for full mode', async () => {
    const { fetchImpl } = fakeFetch(200, sampleResponse)
    const log = vi.fn()
    await chunkPhrase(
      { ...input, confidenceMode: 'full' },
      { fetch: fetchImpl, env, log },
    )
    expect(logged(log).fields.fn).toBe('chunkFullFn')
  })

  it('logs failures as warn with status and code', async () => {
    const { fetchImpl } = fakeFetch(502, {
      error: { code: 'llm_failure', message: 'boom' },
    })
    const log = vi.fn()
    await chunkPhrase(input, { fetch: fetchImpl, env, log })
    const { level, fields } = logged(log)
    expect(level).toBe('warn')
    expect(fields).toMatchObject({ status: 502, code: 'llm_failure' })
  })

  it('logs network failures as status 0', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const log = vi.fn()
    await chunkPhrase(input, { fetch: fetchImpl, env, log })
    expect(logged(log).fields).toMatchObject({ status: 0, code: 'network' })
  })

  it('never logs the phrase or the token', async () => {
    const { fetchImpl } = fakeFetch(200, sampleResponse)
    const log = vi.fn()
    await chunkPhrase(input, { fetch: fetchImpl, env, log })
    const { line } = logged(log)
    expect(line).not.toContain(input.text)
    expect(line).not.toContain(env.CHUNKER_TOKEN)
  })
})
