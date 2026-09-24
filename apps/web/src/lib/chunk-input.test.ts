import { describe, expect, it } from 'vitest'
import { validateChunkInput } from './chunk-input'

describe('validateChunkInput', () => {
  it('trims and passes a valid pair through', () => {
    expect(
      validateChunkInput({ text: '  I miss you  ', region: 'ES' }),
    ).toEqual({ text: 'I miss you', region: 'ES' })
  })

  it('rejects empty and whitespace-only text', () => {
    expect(() => validateChunkInput({ text: '', region: 'ES' })).toThrow(
      'text is empty',
    )
    expect(() => validateChunkInput({ text: '   ', region: 'ES' })).toThrow(
      'text is empty',
    )
  })

  it('rejects 201 characters and accepts 200', () => {
    expect(() =>
      validateChunkInput({ text: 'x'.repeat(201), region: 'ES' }),
    ).toThrow('exceeds 200')
    expect(
      validateChunkInput({ text: 'x'.repeat(200), region: 'ES' }).text,
    ).toHaveLength(200)
  })

  it('rejects an unknown region and non-object input', () => {
    expect(() => validateChunkInput({ text: 'hi', region: 'US' })).toThrow(
      'unknown region',
    )
    expect(() => validateChunkInput(null)).toThrow('invalid input')
    expect(() => validateChunkInput({ region: 'ES' })).toThrow(
      'text is required',
    )
  })
})
