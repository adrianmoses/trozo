import { describe, expect, it } from 'vitest'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { allAsTxt, chunkAsTxtLine, chunkOnly, chunkWithExample } from './copy'

const chunk = sampleResponse.chunks[0]

describe('copy formats', () => {
  it('chunk only copies the pattern', () => {
    expect(chunkOnly(chunk)).toBe('tener (muchas) ganas de')
  })

  it('chunk + example joins with an em dash', () => {
    expect(chunkWithExample(chunk)).toBe(
      'tener (muchas) ganas de — Tengo muchas ganas de ir a la playa este fin de semana.',
    )
  })

  it('TXT line is pattern — example — regions', () => {
    expect(chunkAsTxtLine(chunk)).toBe(
      'tener (muchas) ganas de — Tengo muchas ganas de ir a la playa este fin de semana. — neutral',
    )
    expect(chunkAsTxtLine({ ...chunk, regions: ['ES', 'AR'] })).toMatch(
      / — ES, AR$/,
    )
    expect(chunkAsTxtLine({ ...chunk, regions: [] })).toMatch(/ — neutral$/)
  })

  it('copy all is one TXT line per chunk', () => {
    const two = { chunks: [chunk, { ...chunk, id: 'ch_2', pattern: 'ir a' }] }
    expect(allAsTxt(two).split('\n')).toHaveLength(2)
    expect(allAsTxt(two).split('\n')[1]).toMatch(/^ir a — /)
  })
})
