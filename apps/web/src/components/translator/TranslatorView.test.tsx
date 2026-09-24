import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { renderWithProviders } from '#/test/render'
import { TranslatorView } from './TranslatorView'

const noop = () => {}

describe('TranslatorView', () => {
  it('idle: input bar and tagline only', () => {
    renderWithProviders(
      <TranslatorView
        q=""
        region="neutral"
        state={{ kind: 'idle' }}
        onSubmit={noop}
        onRetry={noop}
      />,
    )
    expect(
      screen.getByText('English in, Spanish chunks out.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('result-skeleton')).not.toBeInTheDocument()
  })

  it('loading: skeleton inside a busy live region', () => {
    renderWithProviders(
      <TranslatorView
        q="I miss you"
        region="MX"
        state={{ kind: 'loading' }}
        onSubmit={noop}
        onRetry={noop}
      />,
    )
    expect(screen.getByTestId('result-skeleton')).toBeInTheDocument()
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toHaveAttribute('aria-busy', 'true')
  })

  it('error: inline alert with the message and a working Retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(
      <TranslatorView
        q="ñññ"
        region="ES"
        state={{
          kind: 'error',
          error: {
            status: 422,
            code: 'invalid_input',
            message: 'input does not look like English text',
          },
        }}
        onSubmit={noop}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'input does not look like English text',
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('network error: friendly wording', () => {
    renderWithProviders(
      <TranslatorView
        q="hi"
        region="ES"
        state={{
          kind: 'error',
          error: { status: 0, code: 'network', message: 'fetch failed' },
        }}
        onSubmit={noop}
        onRetry={noop}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't reach the chunk service (fetch failed).",
    )
  })

  it('result: translation with underlined chunk, watch-out box, cards and Copy all', () => {
    renderWithProviders(
      <TranslatorView
        q={sampleResponse.input}
        region="neutral"
        state={{ kind: 'result', data: sampleResponse }}
        onSubmit={noop}
        onRetry={noop}
      />,
    )
    const translation = screen.getByTestId('translation')
    expect(translation).toHaveTextContent(sampleResponse.translation)
    expect(translation.querySelector('mark')).toHaveTextContent(
      'Tengo muchas ganas de',
    )
    expect(
      screen.getByRole('heading', {
        name: 'Watch out · 1 trap in this phrase',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('chunk-card')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue(sampleResponse.input)
  })

  it('empty result: translation plus the empty line, no traps or cards', () => {
    renderWithProviders(
      <TranslatorView
        q="Madrid"
        region="ES"
        state={{
          kind: 'result',
          data: {
            ...sampleResponse,
            translation: 'Madrid.',
            chunks: [],
            notes: [],
          },
        }}
        onSubmit={noop}
        onRetry={noop}
      />,
    )
    expect(screen.getByTestId('translation')).toHaveTextContent('Madrid.')
    expect(screen.getByText('Nothing worth chunking here.')).toBeInTheDocument()
    expect(screen.queryByTestId('chunk-card')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Watch out/ }),
    ).not.toBeInTheDocument()
  })
})
