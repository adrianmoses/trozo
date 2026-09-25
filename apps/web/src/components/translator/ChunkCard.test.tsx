import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { renderWithProviders } from '#/test/render'
import { ChunkCard } from './ChunkCard'

const chunk = sampleResponse.chunks[0]
const notes = sampleResponse.notes ?? []

describe('ChunkCard', () => {
  it('renders number, pattern, slots, gloss, underlined example and confidence', () => {
    renderWithProviders(<ChunkCard chunk={chunk} index={0} notes={notes} />)
    const card = screen.getByTestId('chunk-card')
    expect(card).toHaveAttribute('id', 'card-ch_1')
    expect(within(card).getByText('01')).toBeInTheDocument()
    expect(
      within(card).getByRole('heading', { name: 'tener (muchas) ganas de' }),
    ).toBeInTheDocument()
    expect(within(card).getByText('+ inf.')).toBeInTheDocument()
    expect(within(card).getByText(chunk.gloss_en)).toBeInTheDocument()
    const example = within(card).getByTestId('example')
    expect(example).toHaveTextContent(chunk.example.es)
    expect(example.querySelector('mark')).toHaveTextContent(
      'Tengo muchas ganas de',
    )
    expect(within(card).getByText('verified')).toBeInTheDocument()
  })

  it('shows "avoids:" for a linked note and never a warning badge', () => {
    renderWithProviders(<ChunkCard chunk={chunk} index={0} notes={notes} />)
    expect(screen.getByTestId('avoids')).toHaveTextContent(
      'avoids: Estoy muy excitado',
    )
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument()
    expect(screen.queryByText(/false friend/i)).not.toBeInTheDocument()
  })

  it('omits "avoids:" when no note points at the card', () => {
    renderWithProviders(<ChunkCard chunk={chunk} index={0} notes={[]} />)
    expect(screen.queryByTestId('avoids')).not.toBeInTheDocument()
  })

  it('shows a register pill only when the register is not neutral', () => {
    const { unmount } = renderWithProviders(
      <ChunkCard chunk={chunk} index={0} notes={[]} />,
    )
    expect(screen.queryByText('neutral')).not.toBeInTheDocument()
    unmount()
    renderWithProviders(
      <ChunkCard
        chunk={{ ...chunk, register: 'coloquial' }}
        index={1}
        notes={[]}
      />,
    )
    expect(screen.getByText('coloquial')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
  })

  it('collapses variants and expands them on click', async () => {
    const user = userEvent.setup()
    const low = {
      ...chunk,
      alternatives: [
        ...(chunk.alternatives ?? []),
        {
          surface: 'estar re manija por + inf.',
          example_es: 'Estoy re manija por ir a la playa.',
          regions: ['AR' as const],
          register: 'coloquial' as const,
          confidence: { label: 'low' as const },
        },
      ],
    }
    renderWithProviders(<ChunkCard chunk={low} index={0} notes={[]} />)
    const toggle = screen.getByRole('button', { name: '+ 2 regional variants' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByText('me hace mucha ilusión + inf.'),
    ).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Hide regional variants')
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('ES')).toBeInTheDocument()
    expect(within(rows[0]).getByText('unrated')).toBeInTheDocument()
    expect(rows[1]).toHaveAttribute('data-variant-confidence', 'low')
    expect(rows[1].className).toMatch(/opacity-60/)
    expect(within(rows[1]).getByText('coloquial')).toBeInTheDocument()
    expect(within(rows[1]).getByText('low')).toBeInTheDocument()
  })

  it('shows no variants toggle when there are no alternatives', () => {
    renderWithProviders(
      <ChunkCard chunk={{ ...chunk, alternatives: [] }} index={0} notes={[]} />,
    )
    expect(
      screen.queryByRole('button', { name: /regional variant/ }),
    ).not.toBeInTheDocument()
  })

  it('greys a low chunk and gives its label the "check this" tooltip', () => {
    renderWithProviders(
      <ChunkCard
        chunk={{
          ...chunk,
          confidence: {
            label: 'low',
            signals: { seed: false, consistency: 0.4, verifier: 'disagree' },
          },
        }}
        index={0}
        notes={[]}
      />,
    )
    expect(screen.getByTestId('chunk-card')).toHaveAttribute(
      'data-card-confidence',
      'low',
    )
    expect(screen.getByTestId('card-body').className).toMatch(/opacity-60/)
    expect(screen.getByText('low').closest('[tabindex="0"]')).not.toBeNull()
  })

  it('does not grey a settled high chunk', () => {
    renderWithProviders(<ChunkCard chunk={chunk} index={0} notes={[]} />)
    expect(screen.getByTestId('card-body').className).not.toMatch(/opacity-60/)
  })
})
