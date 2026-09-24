import type { Note } from '@trozo/schema'
import { cardDomId, flashCard } from '#/lib/flash-card'
import { cardNumberForId, noteKindLabel, trapsHeading } from '#/lib/labels'

function CardLink({ chunkId }: { chunkId: string }) {
  return (
    <a
      href={`#${cardDomId(chunkId)}`}
      onClick={(event) => {
        event.preventDefault()
        flashCard(chunkId)
      }}
      className="font-mono text-xs text-brand-text underline-offset-4 hover:underline"
    >
      → card {cardNumberForId(chunkId)}
    </a>
  )
}

/** The traps box. Notes link to cards; cards never carry a warning badge. */
export function WatchOutBox({ notes }: { notes: Note[] }) {
  if (notes.length === 0) return null
  return (
    <section
      aria-labelledby="watch-out-heading"
      className="rounded-2xl border border-brand-line bg-brand-soft px-5 py-4 sm:px-6"
    >
      <h2
        id="watch-out-heading"
        className="text-sm font-semibold text-brand-text"
      >
        {trapsHeading(notes.length)}
      </h2>
      <ul className="mt-3 grid gap-x-10 gap-y-4 sm:grid-cols-2">
        {notes.map((note, i) => (
          <li key={i} className="text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <s
                lang="es"
                className="font-serif text-lg text-ink decoration-brand-text/70 decoration-2"
              >
                <span className="sr-only">Avoid: </span>
                {note.avoid}
              </s>
              <span className="font-mono text-xs text-brand-text">
                {noteKindLabel(note.kind)}
              </span>
            </p>
            <p className="mt-1 leading-relaxed text-ink-muted">{note.why}</p>
            {note.applies_to && note.applies_to.length > 0 ? (
              <p className="mt-1.5 flex flex-wrap gap-3">
                {note.applies_to.map((id) => (
                  <CardLink key={id} chunkId={id} />
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
