import type { Example } from '@trozo/schema'
import { locateChunk, segmentText } from '#/lib/highlight'
import { Highlighted } from './Highlighted'

export function ExampleSentence({
  example,
  surface,
}: {
  example: Example
  surface: string
}) {
  const segments = segmentText(example.es, [
    locateChunk(example.es, example.highlight, surface),
  ])
  return (
    <p
      lang="es"
      data-testid="example"
      className="rounded-xl bg-surface-2 px-4 py-3 font-serif text-lg leading-relaxed text-ink"
    >
      <Highlighted segments={segments} />
    </p>
  )
}
