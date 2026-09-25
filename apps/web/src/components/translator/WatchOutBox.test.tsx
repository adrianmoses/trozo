import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Note } from '@trozo/schema'
import { WatchOutBox } from './WatchOutBox'

const notes: Note[] = [
  {
    kind: 'false_friend',
    avoid: 'Estoy muy excitado',
    why: "'Excitado' usually reads as sexually aroused.",
    applies_to: ['ch_1'],
  },
  {
    kind: 'register',
    avoid: 'el weekend',
    why: 'Reads as Spanglish outside the US.',
    applies_to: ['ch_3'],
  },
]

describe('WatchOutBox', () => {
  it('renders nothing without notes', () => {
    const { container } = render(<WatchOutBox notes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each trap with kind, struck phrase, reason and card link', () => {
    render(<WatchOutBox notes={notes} />)
    expect(
      screen.getByRole('heading', {
        name: 'Watch out · 2 traps in this phrase',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('False friend')).toBeInTheDocument()
    expect(screen.getByText('Register')).toBeInTheDocument()
    const struck = screen.getByText('Estoy muy excitado', { selector: 's' })
    expect(struck).toHaveTextContent('Avoid: Estoy muy excitado')
    expect(screen.getByText(notes[0].why)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '→ card 01' })).toHaveAttribute(
      'href',
      '#card-ch_1',
    )
    expect(screen.getByRole('link', { name: '→ card 03' })).toHaveAttribute(
      'href',
      '#card-ch_3',
    )
  })

  it('flashes the linked card on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WatchOutBox notes={notes} />
        <article id="card-ch_1" className="chunk-card" />
      </>,
    )
    await user.click(screen.getByRole('link', { name: '→ card 01' }))
    expect(document.getElementById('card-ch_1')).toHaveAttribute('data-flash')
  })
})
