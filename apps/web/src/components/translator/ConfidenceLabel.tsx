import { Loader2Icon } from 'lucide-react'
import type { Confidence, ConfidenceLabel as Label } from '@trozo/schema'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { confidenceDisplay } from '#/lib/labels'
import { cn } from '#/lib/utils'

const DOT: Record<Label, string> = {
  high: 'bg-conf-high',
  med: 'bg-conf-med',
  low: 'bg-conf-low',
  unrated: 'border border-conf-unrated bg-transparent',
}

/** Dot plus text. The text is always rendered: confidence never relies on
 * colour alone. While full confidence is in flight (`pending`), `unrated`
 * shows a spinner in place of the dot; settled labels never do. `low` carries
 * a "check this" tooltip. */
export function ConfidenceLabel({
  confidence,
  pending = false,
  className,
}: {
  confidence: Confidence
  pending?: boolean
  className?: string
}) {
  const display = confidenceDisplay(confidence)
  const spinning = pending && display.label === 'unrated'
  const label = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted',
        className,
      )}
      data-confidence={display.label}
      data-pending={spinning ? '' : undefined}
    >
      {spinning ? (
        <Loader2Icon
          aria-hidden="true"
          data-testid="confidence-spinner"
          className="size-3 animate-spin text-ink-faint"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn('inline-block size-2 rounded-full', DOT[display.label])}
        />
      )}
      {display.text}
      {spinning ? <span className="sr-only"> (checking)</span> : null}
    </span>
  )
  if (display.label !== 'low') return label
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>check this</TooltipContent>
    </Tooltip>
  )
}
