import { describe, expect, it } from 'vitest'
import { sampleResponse } from '@trozo/schema/test/fixture'
import {
  deriveTags,
  findLabel,
  savedKey,
  settledItems,
  toSavedRow,
  validateId,
  validateSaveInput,
  validateSavedFilter,
  validateSyncInput,
} from './saved'

const chunk = sampleResponse.chunks[0]
const alt = chunk.alternatives![0]
const source = { response: sampleResponse, region: 'MX' as const }

describe('toSavedRow', () => {
  it('maps a chunk with its highlight and the notes that apply to it', () => {
    const response = {
      ...sampleResponse,
      notes: [
        ...sampleResponse.notes!,
        {
          kind: 'calque' as const,
          avoid: 'x',
          why: 'y',
          applies_to: ['ch_other'],
        },
      ],
    }
    const row = toSavedRow({ response, region: 'MX' }, chunk)
    expect(row).toMatchObject({
      kind: 'chunk',
      source_text: sampleResponse.input,
      region_requested: 'MX',
      pattern: 'tener (muchas) ganas de',
      surface: 'tener muchas ganas de',
      example_es: chunk.example.es,
      example_en: chunk.example.en,
      highlight: [0, 21],
      register: 'neutral',
      regions: ['neutral'],
      confidence: 'high',
      prompt_version: 'p1',
    })
    expect(row.notes).toHaveLength(1)
    expect(row.notes[0].applies_to).toEqual(['ch_1'])
  })

  it('maps a variant with its own fields and the parent pattern, gloss and English example', () => {
    const row = toSavedRow(source, chunk, alt)
    expect(row).toMatchObject({
      kind: 'variant',
      pattern: chunk.pattern,
      gloss_en: chunk.gloss_en,
      example_en: chunk.example.en,
      surface: alt.surface,
      example_es: alt.example_es,
      regions: ['ES'],
      register: 'neutral',
      confidence: 'unrated',
      highlight: null,
    })
  })

  it('round-trips through the server validator', () => {
    const row = toSavedRow(source, chunk)
    expect(validateSaveInput(JSON.parse(JSON.stringify(row)))).toEqual(row)
  })
})

describe('deriveTags', () => {
  it('always has trozo, one tag per region, and the register', () => {
    expect(deriveTags(['neutral'], 'neutral')).toEqual([
      'trozo',
      'region::neutral',
      'register::neutral',
    ])
    expect(deriveTags(['MX', 'CO'], 'coloquial')).toEqual([
      'trozo',
      'region::MX',
      'region::CO',
      'register::coloquial',
    ])
    expect(deriveTags(['ES'], 'formal')).toContain('register::formal')
    expect(deriveTags(['ES'], null)).toEqual(['trozo', 'region::ES'])
  })
})

describe('savedKey', () => {
  it('is stable and does not collide across the separator', () => {
    expect(savedKey('a', 'b')).toBe(savedKey('a', 'b'))
    expect(savedKey('a b', 'c')).not.toBe(savedKey('a', 'b c'))
  })
})

describe('settledItems / findLabel', () => {
  it('lists only settled chunks and alternatives', () => {
    expect(settledItems(sampleResponse)).toEqual([
      {
        surface: chunk.surface,
        example_es: chunk.example.es,
        confidence: 'high',
      },
    ])
  })

  it('finds the label of a chunk or an alternative', () => {
    expect(findLabel(sampleResponse, alt.surface, alt.example_es)).toBe(
      'unrated',
    )
    expect(findLabel(sampleResponse, chunk.surface, chunk.example.es)).toBe(
      'high',
    )
    expect(findLabel(sampleResponse, 'nope', 'nope')).toBeUndefined()
  })
})

describe('validators', () => {
  const row = toSavedRow(source, chunk)

  it('rejects malformed save input', () => {
    expect(() => validateSaveInput(null)).toThrow('invalid input')
    expect(() => validateSaveInput({ ...row, kind: 'x' })).toThrow('kind')
    expect(() => validateSaveInput({ ...row, surface: ' ' })).toThrow(
      'surface is required',
    )
    expect(() => validateSaveInput({ ...row, regions: ['FR'] })).toThrow(
      'regions',
    )
    expect(() => validateSaveInput({ ...row, confidence: 'great' })).toThrow(
      'confidence',
    )
    expect(() => validateSaveInput({ ...row, highlight: [5, 2] })).toThrow(
      'highlight',
    )
    expect(() =>
      validateSaveInput({ ...row, example_es: 'x'.repeat(1001) }),
    ).toThrow('too long')
  })

  it('accepts only settled labels for sync', () => {
    const item = { surface: 'a', example_es: 'b', confidence: 'med' }
    expect(validateSyncInput([item])).toEqual([item])
    expect(() =>
      validateSyncInput([{ ...item, confidence: 'unrated' }]),
    ).toThrow('settled')
    expect(() => validateSyncInput('x')).toThrow('invalid input')
  })

  it('drops unknown filter values', () => {
    expect(validateSavedFilter({ region: 'MX', tag: 'region::MX' })).toEqual({
      region: 'MX',
      tag: 'region::MX',
    })
    expect(validateSavedFilter({ region: 'FR', tag: 'a b', extra: 1 })).toEqual(
      {},
    )
  })

  it('requires a uuid id', () => {
    const id = '0b6f3c2e-8a9d-4f1e-9c3b-2a1d0e9f8c7b'
    expect(validateId({ id })).toEqual({ id })
    expect(() => validateId({ id: '1' })).toThrow('invalid id')
  })
})
