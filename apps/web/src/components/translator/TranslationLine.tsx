import { CopyIcon } from 'lucide-react'
import type { Chunk } from '@trozo/schema'
import { Button } from '#/components/ui/button'
import { copyText } from '#/lib/copy-text'
import { locateChunk, segmentText } from '#/lib/highlight'
import { Highlighted } from './Highlighted'

export function TranslationLine({
  translation,
  chunks,
}: {
  translation: string
  chunks: Chunk[]
}) {
  const segments = segmentText(
    translation,
    chunks.map((chunk) =>
      locateChunk(translation, chunk.translation_highlight, chunk.surface),
    ),
  )
  return (
    <div className="group flex items-start justify-center gap-2">
      <p
        lang="es"
        data-testid="translation"
        className="text-center font-serif text-xl leading-relaxed text-ink italic sm:text-2xl"
      >
        <span aria-hidden="true" className="mr-2 text-ink-faint not-italic">
          →
        </span>
        <Highlighted segments={segments} />
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy translation"
        className="mt-0.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => void copyText(translation, 'translation')}
      >
        <CopyIcon />
      </Button>
    </div>
  )
}
