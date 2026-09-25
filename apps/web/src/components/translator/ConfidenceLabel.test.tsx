import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '#/test/render'
import { ConfidenceLabel } from './ConfidenceLabel'

describe('ConfidenceLabel', () => {
  it('spins only for unrated while full confidence is pending', () => {
    const { rerender } = renderWithProviders(
      <ConfidenceLabel confidence={{ label: 'unrated' }} pending />,
    )
    expect(screen.getByTestId('confidence-spinner')).toBeInTheDocument()
    expect(screen.getByText('unrated')).toBeInTheDocument()
    expect(screen.getByText('(checking)')).toBeInTheDocument()

    rerender(<ConfidenceLabel confidence={{ label: 'unrated' }} />)
    expect(screen.queryByTestId('confidence-spinner')).not.toBeInTheDocument()

    rerender(
      <ConfidenceLabel
        confidence={{ label: 'high', signals: { seed: true } }}
        pending
      />,
    )
    expect(screen.queryByTestId('confidence-spinner')).not.toBeInTheDocument()
    expect(screen.getByText('verified')).toBeInTheDocument()
  })

  it('settles to the label text', () => {
    renderWithProviders(
      <ConfidenceLabel
        confidence={{
          label: 'med',
          signals: { consistency: 0.8, verifier: 'agree' },
        }}
      />,
    )
    expect(screen.getByText('medium')).toBeInTheDocument()
  })

  it('low carries a keyboard-reachable "check this" tooltip', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConfidenceLabel confidence={{ label: 'low' }} />)
    await user.tab()
    expect(await screen.findAllByText('check this')).not.toHaveLength(0)
    expect(screen.getByText('low')).toBeInTheDocument()
  })
})
