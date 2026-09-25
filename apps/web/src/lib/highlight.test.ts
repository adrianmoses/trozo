import { describe, expect, it } from 'vitest'
import { locateChunk, segmentText, splitHighlight } from './highlight'

const text = 'Tengo muchas ganas de ir a la playa este fin de semana.'

describe('splitHighlight', () => {
  it('splits on a valid service range', () => {
    expect(splitHighlight(text, [0, 21], 'tener muchas ganas de')).toEqual({
      before: '',
      match: 'Tengo muchas ganas de',
      after: ' ir a la playa este fin de semana.',
    })
  })

  it('falls back to a surface search when the range is out of bounds', () => {
    expect(splitHighlight(text, [40, 999], 'a la playa')).toEqual({
      before: 'Tengo muchas ganas de ir ',
      match: 'a la playa',
      after: ' este fin de semana.',
    })
    expect(splitHighlight(text, [5, 5], 'este fin de semana')?.match).toBe(
      'este fin de semana',
    )
  })

  it('falls back when the range is null or missing', () => {
    expect(splitHighlight('Te extraño.', null, 'extraño')?.match).toBe(
      'extraño',
    )
    expect(splitHighlight('Te extraño.', undefined, 'extraño')?.match).toBe(
      'extraño',
    )
  })

  it('matches accent- and case-insensitively with correct indices', () => {
    const split = splitHighlight(
      'Me hace mucha ILUSIÓN verte.',
      null,
      'ilusion',
    )
    expect(split).toEqual({
      before: 'Me hace mucha ',
      match: 'ILUSIÓN',
      after: ' verte.',
    })
    expect(splitHighlight('¿Qué tal?', null, 'que tal')?.match).toBe('Qué tal')
  })

  it('returns null when the surface is not in the text', () => {
    expect(splitHighlight('Tengo hambre.', null, 'tener hambre')).toBeNull()
    expect(splitHighlight('Tengo hambre.', null, '')).toBeNull()
  })
})

describe('locateChunk and segmentText', () => {
  it('locates via range, then via search, then null', () => {
    expect(locateChunk(text, [0, 21], 'x')).toEqual([0, 21])
    expect(locateChunk(text, null, 'a la playa')).toEqual([25, 35])
    expect(locateChunk(text, null, 'nope')).toBeNull()
  })

  it('segments a sentence around several chunks in order', () => {
    const segments = segmentText(text, [
      locateChunk(text, null, 'este fin de semana'),
      [0, 21],
      null,
      locateChunk(text, null, 'ir a'),
    ])
    expect(segments.map((s) => [s.text, s.highlighted])).toEqual([
      ['Tengo muchas ganas de', true],
      [' ', false],
      ['ir a', true],
      [' la playa ', false],
      ['este fin de semana', true],
      ['.', false],
    ])
  })

  it('drops overlapping ranges and handles no ranges', () => {
    expect(
      segmentText('abcdef', [
        [0, 4],
        [2, 6],
      ]),
    ).toEqual([
      { text: 'abcd', highlighted: true },
      { text: 'ef', highlighted: false },
    ])
    expect(segmentText('abc', [])).toEqual([
      { text: 'abc', highlighted: false },
    ])
  })
})
