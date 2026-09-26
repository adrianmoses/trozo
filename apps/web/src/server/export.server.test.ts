// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedItem } from '#/lib/saved'
import { pageSaved } from '#/server/saved.server'
import { exportResponse } from './export.server'

vi.mock('#/server/saved.server', () => ({ pageSaved: vi.fn() }))

const base: SavedItem = {
  id: '0b6f3c2e-8a9d-4f1e-9c3b-2a1d0e9f8c7b',
  kind: 'chunk',
  source_text: 'I miss you',
  region_requested: 'MX',
  pattern: 'extrañar',
  surface: 'extrañar',
  gloss_en: 'to miss',
  example_es: 'Te extraño.',
  example_en: 'I miss you.',
  highlight: [3, 10],
  register: 'neutral',
  regions: ['MX'],
  confidence: 'high',
  notes: [],
  tags: ['trozo', 'region::MX', 'register::neutral'],
  prompt_version: 'p1',
  created_at: '2026-09-26T10:00:00.000Z',
}
const date = new Date('2026-09-26T12:00:00Z')

beforeEach(() => {
  vi.mocked(pageSaved).mockReset()
})

async function bytes(response: Response) {
  return new Uint8Array(await response.arrayBuffer())
}

describe('exportResponse', () => {
  it('streams BOM, Anki headers and rows across pages', async () => {
    const cursor = { createdAt: new Date(), id: base.id }
    vi.mocked(pageSaved)
      .mockResolvedValueOnce({ items: [base], next: cursor })
      .mockResolvedValueOnce({
        items: [{ ...base, surface: 'añorar', example_es: 'Te añoro.' }],
        next: null,
      })
    const response = exportResponse('csv', { region: 'MX' }, date)
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="trozo-2026-09-26.csv"',
    )
    const body = await bytes(response)
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(body)
    expect(text.split('\r\n')).toEqual([
      '\uFEFF#separator:Comma',
      '#html:true',
      '#notetype:Basic',
      '#columns:Front,Back,Tags',
      '#tags column:3',
      'I miss you.,Te <b>extraño</b>.<br>extrañar · MX,trozo region::MX register::neutral',
      'I miss you.,Te añoro.<br>extrañar · MX,trozo region::MX register::neutral',
      '',
    ])
    expect(pageSaved).toHaveBeenNthCalledWith(1, { region: 'MX' }, null, 500)
    expect(pageSaved).toHaveBeenNthCalledWith(2, { region: 'MX' }, cursor, 500)
  })

  it('cloze and txt formats', async () => {
    vi.mocked(pageSaved).mockResolvedValue({ items: [base], next: null })
    const cloze = exportResponse('cloze', {}, date)
    expect(cloze.headers.get('Content-Disposition')).toContain(
      'trozo-2026-09-26-cloze.csv',
    )
    expect(await cloze.text()).toContain('Te {{c1::extraño}}.')
    const txt = exportResponse('txt', {}, date)
    expect(txt.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(await txt.text()).toBe('extrañar — Te extraño. — MX\r\n')
  })

  it('an empty export is just the preamble', async () => {
    vi.mocked(pageSaved).mockResolvedValue({ items: [], next: null })
    expect(await exportResponse('cloze', {}, date).text()).toBe(
      '#separator:Comma\r\n#html:true\r\n#notetype:Cloze\r\n' +
        '#columns:Text,Extra,Tags\r\n#tags column:3\r\n',
    )
  })
})
