import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '#/test/render'
import Header from './Header'

vi.mock('#/server/saved.functions', () => ({
  savedIndexFn: vi.fn().mockResolvedValue({ count: 3, keys: ['a', 'b', 'c'] }),
}))

describe('Header', () => {
  it('shows the saved count linking to /saved, and Export to Anki', async () => {
    await renderWithRouter(<Header />)
    const saved = await screen.findByRole('link', { name: 'Saved · 3' })
    expect(saved).toHaveAttribute('href', '/saved')
    const exportLink = screen.getByRole('link', { name: 'Export to Anki' })
    expect(exportLink).toHaveAttribute('href', '/api/export?format=csv')
    expect(exportLink).toHaveAttribute('download')
  })
})
