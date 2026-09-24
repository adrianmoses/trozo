import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputBar } from './InputBar'

describe('InputBar', () => {
  it('submits trimmed text and region on Enter and on the button', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<InputBar text="" region="neutral" onSubmit={onSubmit} />)
    const box = screen.getByRole('textbox', { name: 'English phrase' })
    const button = screen.getByRole('button', { name: 'Chunk it' })
    expect(button).toBeDisabled()

    await user.type(box, '  I miss you ')
    expect(screen.getByTestId('counter')).toHaveTextContent('13/200')
    expect(button).toBeEnabled()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('I miss you', 'neutral')

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Region' }),
      'MX',
    )
    await user.click(button)
    expect(onSubmit).toHaveBeenLastCalledWith('I miss you', 'MX')
  })

  it('inserts a newline on Shift+Enter without submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<InputBar text="" region="ES" onSubmit={onSubmit} />)
    const box = screen.getByRole('textbox', { name: 'English phrase' })
    await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(box).toHaveValue('line one\nline two')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks over-long input and shows the counter in warning colour', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<InputBar text="" region="ES" onSubmit={onSubmit} />)
    const box = screen.getByRole('textbox', { name: 'English phrase' })
    await user.click(box)
    await user.paste('x'.repeat(201))
    expect(screen.getByTestId('counter')).toHaveTextContent('201/200')
    expect(screen.getByTestId('counter').className).toMatch(/brand-text/)
    expect(screen.getByRole('button', { name: 'Chunk it' })).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('follows the URL when the text prop changes', () => {
    const { rerender } = render(
      <InputBar text="I miss you" region="MX" onSubmit={vi.fn()} />,
    )
    expect(screen.getByRole('textbox')).toHaveValue('I miss you')
    rerender(<InputBar text="I am hungry" region="AR" onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('I am hungry')
    expect(screen.getByRole('combobox')).toHaveValue('AR')
  })
})
