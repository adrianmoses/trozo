import { describe, expect, it } from 'vitest'
import { validateTranslatorSearch } from './search'

describe('validateTranslatorSearch', () => {
  it('keeps a valid q and region and drops junk keys', () => {
    expect(
      validateTranslatorSearch({ q: 'I miss you', region: 'MX', junk: 1 }),
    ).toEqual({ q: 'I miss you', region: 'MX' })
  })

  it('trims and caps q at 200 characters, omitting it when empty', () => {
    expect(validateTranslatorSearch({ q: '  hi  ' })).toEqual({ q: 'hi' })
    expect(validateTranslatorSearch({ q: '   ' })).toEqual({})
    expect(validateTranslatorSearch({ q: 'x'.repeat(250) }).q).toHaveLength(200)
  })

  it('omits an unknown or non-string region', () => {
    expect(validateTranslatorSearch({ region: 'US' })).toEqual({})
    expect(validateTranslatorSearch({ region: 7 })).toEqual({})
    expect(validateTranslatorSearch({ q: 5 })).toEqual({})
  })
})
