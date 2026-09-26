import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SavedItem } from '#/lib/saved'
import { renderWithRouter } from '#/test/render'
import { SavedView } from './SavedView'

function item(overrides: Partial<SavedItem>): SavedItem {
  return {
    id: '0b6f3c2e-8a9d-4f1e-9c3b-2a1d0e9f8c7b',
    kind: 'chunk',
    source_text: 'I miss you',
    region_requested: 'MX',
    pattern: 'extrañar a alguien',
    surface: 'extrañar',
    gloss_en: 'to miss someone',
    example_es: 'Te extraño mucho.',
    example_en: 'I miss you a lot.',
    highlight: [3, 10],
    register: 'neutral',
    regions: ['MX'],
    confidence: 'high',
    notes: [],
    tags: ['trozo', 'region::MX', 'register::neutral'],
    prompt_version: 'p1',
    created_at: '2026-09-26T10:00:00.000Z',
    ...overrides,
  }
}

const items = [
  item({}),
  item({
    id: '1b6f3c2e-8a9d-4f1e-9c3b-2a1d0e9f8c7b',
    kind: 'variant',
    surface: 'echar de menos',
    example_es: 'Te echo mucho de menos.',
    regions: ['ES'],
    register: 'coloquial',
    confidence: 'low',
    tags: ['trozo', 'region::ES', 'register::coloquial'],
  }),
]

describe('SavedView', () => {
  it('lists rows with pattern, surface, examples, pills, label and source', async () => {
    await renderWithRouter(
      <SavedView
        items={items}
        filter={{}}
        onFilter={vi.fn()}
        onDelete={vi.fn()}
      />,
      { path: '/saved' },
    )
    const rows = await screen.findAllByTestId('saved-row')
    expect(rows).toHaveLength(2)
    const first = within(rows[0])
    expect(
      first.getByRole('heading', { name: 'extrañar a alguien' }),
    ).toBeVisible()
    expect(first.getByText('extrañar')).toBeVisible()
    expect(first.getByText('Te extraño mucho.')).toBeVisible()
    expect(first.getByText('I miss you a lot.')).toBeVisible()
    expect(first.getByText('MX')).toBeVisible()
    expect(first.getByText(/from “I miss you”/)).toBeVisible()
    expect(within(rows[1]).getByText('coloquial')).toBeVisible()
    expect(within(rows[1]).getByText(/regional variant/)).toBeVisible()
  })

  it('export links carry the current filters', async () => {
    await renderWithRouter(
      <SavedView
        items={items}
        filter={{ region: 'MX' }}
        onFilter={vi.fn()}
        onDelete={vi.fn()}
      />,
      { path: '/saved' },
    )
    const group = await screen.findByRole('group', { name: /export/i })
    const hrefs = within(group)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '/api/export?format=csv&region=MX',
      '/api/export?format=cloze&region=MX',
      '/api/export?format=txt&region=MX',
    ])
  })

  it('filters by region and toggles tag chips', async () => {
    const onFilter = vi.fn()
    await renderWithRouter(
      <SavedView
        items={items}
        filter={{}}
        onFilter={onFilter}
        onDelete={vi.fn()}
      />,
      { path: '/saved' },
    )
    await userEvent.selectOptions(await screen.findByLabelText('Region'), 'MX')
    expect(onFilter).toHaveBeenLastCalledWith({ region: 'MX' })
    await userEvent.click(
      screen.getByRole('button', { name: 'register::coloquial' }),
    )
    expect(onFilter).toHaveBeenLastCalledWith({ tag: 'register::coloquial' })
    expect(screen.queryByRole('button', { name: 'trozo' })).toBeNull()
  })

  it('deletes only after confirming', async () => {
    const onDelete = vi.fn()
    await renderWithRouter(
      <SavedView
        items={items}
        filter={{}}
        onFilter={vi.fn()}
        onDelete={onDelete}
      />,
      { path: '/saved' },
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete extrañar' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    expect(onDelete).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete extrañar' }),
    )
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    )
    expect(onDelete).toHaveBeenCalledWith(items[0].id)
  })

  it('shows the empty state with a link back to the translator', async () => {
    await renderWithRouter(
      <SavedView
        items={[]}
        filter={{}}
        onFilter={vi.fn()}
        onDelete={vi.fn()}
      />,
      { path: '/saved' },
    )
    expect(await screen.findByText(/Nothing saved yet/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Chunk a phrase' }),
    ).toHaveAttribute('href', '/')
  })
})
