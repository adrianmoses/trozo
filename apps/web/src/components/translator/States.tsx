import { Button } from '#/components/ui/button'
import type { ChunkServiceError } from '#/lib/chunker.server'
import { describeError } from '#/lib/errors'

export function ResultSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="result-skeleton"
      className="animate-pulse space-y-8"
    >
      <div className="mx-auto h-7 w-2/3 rounded-md bg-surface-2" />
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-72 rounded-2xl border border-line bg-surface"
          />
        ))}
      </div>
    </div>
  )
}

export function EmptyResult() {
  return (
    <p className="text-center text-sm text-ink-muted">
      Nothing worth chunking here.
    </p>
  )
}

export function InlineError({
  error,
  onRetry,
}: {
  error: ChunkServiceError
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-sm"
    >
      <p className="text-ink">{describeError(error)}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
