import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { toast } from 'sonner'
import { renderWithProviders } from '#/test/render'
import { CopyButton } from './CopyButton'
import { TranslationLine } from './TranslationLine'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const chunk = sampleResponse.chunks[0]

// user-event installs its own clipboard stub on setup, so spy on that.
function setup() {
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  return { user, writeText }
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('CopyButton', () => {
  it('main click copies the chunk and toasts', async () => {
    const { user, writeText } = setup()
    renderWithProviders(<CopyButton chunk={chunk} />)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('tener (muchas) ganas de')
    expect(toast.success).toHaveBeenCalledWith('Copied chunk')
  })

  it('menu offers chunk + example', async () => {
    const { user, writeText } = setup()
    renderWithProviders(<CopyButton chunk={chunk} />)
    await user.click(screen.getByRole('button', { name: 'More copy options' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy chunk + example' }),
    )
    expect(writeText).toHaveBeenCalledWith(
      'tener (muchas) ganas de — Tengo muchas ganas de ir a la playa este fin de semana.',
    )
    expect(toast.success).toHaveBeenCalledWith('Copied chunk + example')
  })

  it('reports a failed copy', async () => {
    const { user, writeText } = setup()
    writeText.mockRejectedValueOnce(new Error('denied'))
    renderWithProviders(<CopyButton chunk={chunk} />)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(toast.error).toHaveBeenCalledWith('Copy failed')
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('TranslationLine copy', () => {
  it('copies the full translation', async () => {
    const { user, writeText } = setup()
    renderWithProviders(
      <TranslationLine
        translation={sampleResponse.translation}
        chunks={sampleResponse.chunks}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Copy translation' }))
    expect(writeText).toHaveBeenCalledWith(sampleResponse.translation)
    expect(toast.success).toHaveBeenCalledWith('Copied translation')
  })
})
