import { describe, expect, it, vi } from 'vitest'
import { formatLog, logJson } from './log.server'

describe('formatLog', () => {
  it('writes one JSON object with ts, level and the fields', () => {
    const line = formatLog(
      'info',
      { event: 'chunker_call', status: 200, cache_hit: true },
      new Date('2026-10-01T10:00:00.000Z'),
    )
    expect(line).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      ts: '2026-10-01T10:00:00.000Z',
      level: 'info',
      event: 'chunker_call',
      status: 200,
      cache_hit: true,
    })
  })

  it('drops undefined fields', () => {
    expect(
      JSON.parse(formatLog('warn', { a: 1, b: undefined })),
    ).not.toHaveProperty('b')
  })
})

describe('logJson', () => {
  it('passes the line and level to the writer', () => {
    const write = vi.fn()
    logJson('error', { event: 'request_error' }, write)
    const [line, level] = write.mock.calls[0]
    expect(level).toBe('error')
    expect(JSON.parse(line)).toMatchObject({
      level: 'error',
      event: 'request_error',
    })
  })
})
