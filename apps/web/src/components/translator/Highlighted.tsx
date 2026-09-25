import type { Segment } from '#/lib/highlight'

/** Render text segments, underlining the highlighted ones. */
export function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.highlighted ? (
          <mark
            key={i}
            className="bg-transparent text-inherit underline decoration-brand-text/70 decoration-2 underline-offset-4"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}
