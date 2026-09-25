import type { Confidence, ConfidenceLabel as Label } from '@trozo/schema'
import { confidenceDisplay } from '#/lib/labels'
import { cn } from '#/lib/utils'

const DOT: Record<Label, string> = {
  high: 'bg-conf-high',
  med: 'bg-conf-med',
  low: 'bg-conf-low',
  unrated: 'border border-conf-unrated bg-transparent',
}

/** Dot plus text. The text is always rendered: confidence never relies on
 * colour alone, and `unrated` is a static neutral state in 002. */
export function ConfidenceLabel({
  confidence,
  className,
}: {
  confidence: Confidence
  className?: string
}) {
  const display = confidenceDisplay(confidence)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted',
        className,
      )}
      data-confidence={display.label}
    >
      <span
        aria-hidden="true"
        className={cn('inline-block size-2 rounded-full', DOT[display.label])}
      />
      {display.text}
    </span>
  )
}
