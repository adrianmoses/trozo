import { describe, expect, it } from 'vitest'
import {
  BOM,
  chunkSpan,
  csvEscape,
  exportFilename,
  exportHref,
  exportPreamble,
  formatBasicRow,
  formatClozeRow,
  formatTxtLine,
} from './export'
import type { SavedItem } from './saved'

function item(overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    id: '0b6f3c2e-8a9d-4f1e-9c3b-2a1d0e9f8c7b',
    kind: 'chunk',
    source_text: "I'm really excited to see you",
    region_requested: 'neutral',
    pattern: 'tener (muchas) ganas de',
    surface: 'tener muchas ganas de',
    gloss_en: 'to really look forward to',
    example_es: 'Tengo muchas ganas de verte.',
    example_en: "I'm really looking forward to seeing you.",
    highlight: [0, 21],
    register: 'neutral',
    regions: ['neutral'],
    confidence: 'high',
    notes: [],
    tags: ['trozo', 'region::neutral', 'register::neutral'],
    prompt_version: 'p1',
    created_at: '2026-09-26T10:00:00.000Z',
    ...overrides,
  }
}

describe('csvEscape', () => {
  it('quotes commas, quotes and line breaks per RFC 4180', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a, b')).toBe('"a, b"')
    expect(csvEscape('say "hola"')).toBe('"say ""hola"""')
    expect(csvEscape('a\nb')).toBe('"a\nb"')
    expect(csvEscape('a\r\nb')).toBe('"a\r\nb"')
  })
})

describe('preamble', () => {
  it('starts with exactly one BOM, plus Anki file headers for CSV formats', () => {
    expect(exportPreamble('csv')).toBe(
      BOM +
        '#separator:Comma\r\n#html:true\r\n#notetype:Basic\r\n' +
        '#columns:Front,Back,Tags\r\n#tags column:3\r\n',
    )
    expect(exportPreamble('cloze')).toBe(
      BOM +
        '#separator:Comma\r\n#html:true\r\n#notetype:Cloze\r\n' +
        '#columns:Text,Extra,Tags\r\n#tags column:3\r\n',
    )
    expect(exportPreamble('txt')).toBe(BOM)
    const body = exportPreamble('csv') + formatBasicRow(item())
    expect(body.split(BOM)).toHaveLength(2)
  })
})

describe('chunkSpan', () => {
  it('uses the stored highlight', () => {
    expect(chunkSpan(item())).toEqual([0, 21])
  })

  it('falls back to a case-insensitive surface match, ignoring slot markers', () => {
    expect(
      chunkSpan(
        item({
          highlight: null,
          surface: 'me hace mucha ilusión + inf.',
          example_es: 'Me hace mucha ilusión ir a la playa.',
        }),
      ),
    ).toEqual([0, 21])
  })

  it('returns null when the surface is not in the example', () => {
    expect(chunkSpan(item({ highlight: null, surface: 'extrañar' }))).toBeNull()
  })

  it('ignores a highlight that runs past the example', () => {
    expect(chunkSpan(item({ highlight: [0, 999], surface: 'nada' }))).toBeNull()
  })
})

describe('formatBasicRow', () => {
  it('Front is English; Back bolds the chunk and adds pattern and regions', () => {
    expect(formatBasicRow(item())).toBe(
      "I'm really looking forward to seeing you.," +
        '<b>Tengo muchas ganas de</b> verte.<br>tener (muchas) ganas de · neutral,' +
        'trozo region::neutral register::neutral\r\n',
    )
  })

  it('leaves Back unbolded when the chunk cannot be located', () => {
    const line = formatBasicRow(item({ highlight: null, surface: 'extrañar' }))
    expect(line).not.toContain('<b>')
    expect(line).toContain('Tengo muchas ganas de verte.<br>')
  })

  it('escapes HTML and CSV specials, and keeps accents', () => {
    const line = formatBasicRow(
      item({
        example_en: 'Tom & Jerry, "friends"',
        example_es: '¿Añoras <eso>?',
        highlight: null,
        surface: 'añoras',
        regions: ['ES', 'MX'],
      }),
    )
    expect(line).toBe(
      '"Tom &amp; Jerry, ""friends""",' +
        '"¿<b>Añoras</b> &lt;eso&gt;?<br>tener (muchas) ganas de · ES, MX",' +
        'trozo region::neutral register::neutral\r\n',
    )
  })
})

describe('formatClozeRow', () => {
  it('clozes the chunk inside the example', () => {
    expect(formatClozeRow(item())).toBe(
      '{{c1::Tengo muchas ganas de}} verte.,' +
        "I'm really looking forward to seeing you.<br>tener (muchas) ganas de · neutral," +
        'trozo region::neutral register::neutral\r\n',
    )
  })

  it('falls back to the surface as the deletion, so every row imports', () => {
    const line = formatClozeRow(item({ highlight: null, surface: 'extrañar' }))
    expect(
      line.startsWith('{{c1::extrañar}} — Tengo muchas ganas de verte.,'),
    ).toBe(true)
  })

  it('every row has a cloze deletion', () => {
    const rows = [
      item(),
      item({ highlight: null }),
      item({ highlight: null, surface: 'no está' }),
      item({ kind: 'variant', highlight: null, example_en: null }),
    ]
    for (const row of rows) expect(formatClozeRow(row)).toContain('{{c1::')
  })
})

describe('formatTxtLine', () => {
  it('is pattern — example_es — regions', () => {
    expect(formatTxtLine(item({ regions: ['MX', 'CO'] }))).toBe(
      'tener (muchas) ganas de — Tengo muchas ganas de verte. — MX, CO\r\n',
    )
  })
})

describe('exportFilename / exportHref', () => {
  const date = new Date('2026-09-26T12:00:00Z')

  it('names downloads by date and format', () => {
    expect(exportFilename('csv', date)).toBe('trozo-2026-09-26.csv')
    expect(exportFilename('cloze', date)).toBe('trozo-2026-09-26-cloze.csv')
    expect(exportFilename('txt', date)).toBe('trozo-2026-09-26.txt')
  })

  it('carries the /saved filters', () => {
    expect(exportHref('csv', {})).toBe('/api/export?format=csv')
    expect(exportHref('cloze', { region: 'MX', tag: 'register::formal' })).toBe(
      '/api/export?format=cloze&region=MX&tag=register%3A%3Aformal',
    )
  })
})
