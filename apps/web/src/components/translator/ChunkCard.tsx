import type { Chunk, Note } from '@trozo/schema'
import { cardDomId } from '#/lib/flash-card'
import { cardNumber } from '#/lib/labels'
import { cn } from '#/lib/utils'
import { ConfidenceLabel } from './ConfidenceLabel'
import { CopyButton } from './CopyButton'
import { ExampleSentence } from './ExampleSentence'
import { RegisterPill, SlotPill } from './Pills'
import { VariantsList } from './VariantsList'

export function ChunkCard({
  chunk,
  index,
  notes,
  pending = false,
}: {
  chunk: Chunk
  index: number
  notes: Note[]
  pending?: boolean
}) {
  const low = chunk.confidence.label === 'low'
  const avoids = notes.filter((note) => note.applies_to?.includes(chunk.id))
  const slots = chunk.slots ?? []
  const register = chunk.register ?? 'neutral'
  const headingId = `${cardDomId(chunk.id)}-pattern`
  return (
    <article
      id={cardDomId(chunk.id)}
      data-testid="chunk-card"
      aria-labelledby={headingId}
      data-card-confidence={chunk.confidence.label}
      className="chunk-card flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <span className="font-mono text-sm text-ink-faint">
          {cardNumber(index)}
        </span>
        <ConfidenceLabel confidence={chunk.confidence} pending={pending} />
      </header>
      <div className={cn(low && 'opacity-60')} data-testid="card-body">
        <h3
          id={headingId}
          lang="es"
          className="font-serif text-2xl leading-tight font-semibold text-ink"
        >
          {chunk.pattern}
        </h3>
        {slots.length > 0 || register !== 'neutral' ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <SlotPill key={slot} slot={slot} />
            ))}
            {register !== 'neutral' ? (
              <RegisterPill register={register} />
            ) : null}
          </div>
        ) : null}
        <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
          {chunk.gloss_en}
        </p>
      </div>
      <ExampleSentence example={chunk.example} surface={chunk.surface} />
      {avoids.length > 0 ? (
        <p className="text-xs text-ink-faint" data-testid="avoids">
          avoids: {avoids.map((note) => note.avoid).join(' · ')}
        </p>
      ) : null}
      <VariantsList alternatives={chunk.alternatives ?? []} pending={pending} />
      <footer className="mt-auto border-t border-line pt-4">
        <CopyButton chunk={chunk} />
      </footer>
    </article>
  )
}
