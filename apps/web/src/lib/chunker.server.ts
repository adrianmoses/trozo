// Server-only client for the chunk service. Imported by server functions
// only; CHUNKER_URL and CHUNKER_TOKEN never reach the browser.
import type { ChunkResponse, ErrorResponse, Region } from '@trozo/schema'
import { logJson } from '#/lib/log.server'
import type { LogWriter } from '#/lib/log.server'

export interface ChunkServiceError {
  /** HTTP status, or 0 when the request never got a response. */
  status: number
  code: string
  message: string
}

export type ChunkResult =
  { ok: true; data: ChunkResponse } | { ok: false; error: ChunkServiceError }

export interface ChunkPhraseInput {
  text: string
  region: Region
  /** `full` adds self-consistency + verifier signals (feature 003). */
  confidenceMode?: 'fast' | 'full'
}

export interface ChunkerConfig {
  baseUrl: string
  token?: string
}

export function chunkerConfig(
  env: Record<string, string | undefined> = process.env,
): ChunkerConfig {
  const baseUrl = (env.CHUNKER_URL || 'http://localhost:8000').replace(
    /\/+$/,
    '',
  )
  return { baseUrl, token: env.CHUNKER_TOKEN || undefined }
}

/** One JSON line per call (009): mode, status and latency, plus the
 * chunker's cache flag and dropped count on success. Never the phrase or the
 * token. */
function logCall(
  mode: 'fast' | 'full',
  started: number,
  result: ChunkResult,
  write?: LogWriter,
): ChunkResult {
  const latency_ms = Math.round(performance.now() - started)
  if (result.ok) {
    logJson(
      'info',
      {
        event: 'chunker_call',
        fn: mode === 'full' ? 'chunkFullFn' : 'chunkFn',
        status: 200,
        latency_ms,
        cache_hit: result.data.meta.cached,
        dropped: result.data.meta.dropped?.length ?? 0,
      },
      write,
    )
  } else {
    logJson(
      'warn',
      {
        event: 'chunker_call',
        fn: mode === 'full' ? 'chunkFullFn' : 'chunkFn',
        status: result.error.status,
        code: result.error.code,
        latency_ms,
      },
      write,
    )
  }
  return result
}

export async function chunkPhrase(
  input: ChunkPhraseInput,
  options: {
    fetch?: typeof fetch
    env?: Record<string, string | undefined>
    log?: LogWriter
  } = {},
): Promise<ChunkResult> {
  const mode = input.confidenceMode ?? 'fast'
  const started = performance.now()
  return logCall(
    mode,
    started,
    await requestChunk(input, mode, options),
    options.log,
  )
}

async function requestChunk(
  input: ChunkPhraseInput,
  mode: 'fast' | 'full',
  options: {
    fetch?: typeof fetch
    env?: Record<string, string | undefined>
  },
): Promise<ChunkResult> {
  const doFetch = options.fetch ?? fetch
  const { baseUrl, token } = chunkerConfig(options.env)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (token) headers.authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await doFetch(`${baseUrl}/v1/chunk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: input.text,
        preferred_region: input.region,
        confidence_mode: mode,
      }),
    })
  } catch (e) {
    return {
      ok: false,
      error: {
        status: 0,
        code: 'network',
        message: e instanceof Error ? e.message : String(e),
      },
    }
  }

  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (body as ErrorResponse | null)?.error
    return {
      ok: false,
      error: {
        status: res.status,
        code: err?.code ?? 'http_error',
        message: err?.message ?? `chunk service returned ${res.status}`,
      },
    }
  }
  return { ok: true, data: body as ChunkResponse }
}
