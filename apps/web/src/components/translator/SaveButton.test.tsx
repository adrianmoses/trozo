import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleResponse } from '@trozo/schema/test/fixture'
import { savedKey, toSavedRow } from '#/lib/saved'
import { SAVED_INDEX_KEY } from '#/lib/saved-query'
import { saveChunkFn, savedIndexFn } from '#/server/saved.functions'
import { renderWithProviders, testQueryClient } from '#/test/render'
import { ChunkCard } from './ChunkCard'
import { SaveButton } from './SaveButton'

vi.mock('#/server/saved.functions', () => ({
  saveChunkFn: vi.fn(),
  savedIndexFn: vi.fn(),
  listSavedFn: vi.fn(),
  deleteSavedFn: vi.fn(),
  syncConfidenceFn: vi.fn(),
}))
vi.mock('#/server/chunk.functions', () => ({
  chunkFn: vi.fn(),
  chunkFullFn: vi.fn(),
}))

const chunk = sampleResponse.chunks[0]
const alt = chunk.alternatives![0]
const source = { response: sampleResponse, region: 'neutral' as const }
const row = toSavedRow(source, chunk)

let savedKeys: string[] = []
beforeEach(() => {
  savedKeys = []
  vi.mocked(saveChunkFn).mockReset()
  vi.mocked(savedIndexFn).mockReset()
  vi.mocked(savedIndexFn).mockImplementation(async () => ({
    count: savedKeys.length,
    keys: savedKeys,
  }))
})

describe('SaveButton', () => {
  it('saves on click, then shows a disabled "Saved ✓"', async () => {
    vi.mocked(saveChunkFn).mockImplementation(async () => {
      savedKeys = [savedKey(row.surface, row.example_es)]
      return { id: 'x' }
    })
    renderWithProviders(<SaveButton row={row} />)
    const button = await screen.findByRole('button', { name: /^save$/i })
    await userEvent.click(button)
    expect(saveChunkFn).toHaveBeenCalledWith({ data: row })
    const saved = await screen.findByRole('button', { name: 'Saved ✓' })
    expect(saved).toBeDisabled()
  })

  it('shows "Saved ✓" for an item already in the saved index', async () => {
    savedKeys = [savedKey(row.surface, row.example_es)]
    renderWithProviders(<SaveButton row={row} />)
    expect(
      await screen.findByRole('button', { name: 'Saved ✓' }),
    ).toBeDisabled()
  })

  it('returns to "Save" when saving fails', async () => {
    vi.mocked(saveChunkFn).mockRejectedValue(new Error('db down'))
    const client = testQueryClient()
    client.setQueryData(SAVED_INDEX_KEY, { count: 0, keys: [] })
    renderWithProviders(<SaveButton row={row} />, client)
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled(),
    )
  })
})

describe('ChunkCard with a source', () => {
  it('has a Save for the card and one per variant row', async () => {
    savedKeys = [savedKey(alt.surface, alt.example_es)]
    renderWithProviders(
      <ChunkCard chunk={chunk} index={0} notes={[]} source={source} />,
    )
    const card = screen.getByTestId('chunk-card')
    expect(
      await within(card).findByRole('button', { name: /^save$/i }),
    ).toBeEnabled()
    await userEvent.click(
      within(card).getByRole('button', { name: /regional variant/i }),
    )
    expect(
      await within(card).findByRole('button', {
        name: `Saved ✓: ${alt.surface}`,
      }),
    ).toBeDisabled()
  })

  it('has no Save without a source', () => {
    renderWithProviders(<ChunkCard chunk={chunk} index={0} notes={[]} />)
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })
})
