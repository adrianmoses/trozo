import { CopyIcon } from 'lucide-react'
import type { ChunkResponse, Region } from '@trozo/schema'
import { Button } from '#/components/ui/button'
import type { ChunkServiceError } from '#/lib/chunker.server'
import { allAsTxt } from '#/lib/copy'
import { copyText } from '#/lib/copy-text'
import { ChunkCard } from './ChunkCard'
import { InputBar } from './InputBar'
import { EmptyResult, InlineError, ResultSkeleton } from './States'
import { TranslationLine } from './TranslationLine'
import { WatchOutBox } from './WatchOutBox'

export type TranslatorState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: ChunkServiceError }
  | { kind: 'result'; data: ChunkResponse }

function Result({ data, pending }: { data: ChunkResponse; pending: boolean }) {
  const notes = data.notes ?? []
  const count = data.chunks.length
  return (
    <>
      <TranslationLine translation={data.translation} chunks={data.chunks} />
      {count === 0 ? (
        <EmptyResult />
      ) : (
        <>
          <WatchOutBox notes={notes} />
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs tracking-wider text-ink-faint uppercase">
              {count} {count === 1 ? 'chunk' : 'chunks'}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-ink-muted"
              onClick={() => void copyText(allAsTxt(data), 'all chunks')}
            >
              <CopyIcon /> Copy all
            </Button>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {data.chunks.map((chunk, index) => (
              <ChunkCard
                key={chunk.id}
                chunk={chunk}
                index={index}
                notes={notes}
                pending={pending}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

export function TranslatorView({
  q,
  region,
  state,
  confidencePending = false,
  onSubmit,
  onRetry,
}: {
  q: string
  region: Region
  state: TranslatorState
  /** Full confidence is in flight: unrated labels show a spinner. */
  confidencePending?: boolean
  onSubmit: (text: string, region: Region) => void
  onRetry: () => void
}) {
  return (
    <main className="page-wrap px-4 pt-10 pb-16 sm:pt-14">
      <InputBar
        text={q}
        region={region}
        busy={state.kind === 'loading'}
        onSubmit={onSubmit}
      />
      {state.kind === 'error' ? (
        <div className="mt-4">
          <InlineError error={state.error} onRetry={onRetry} />
        </div>
      ) : null}
      {state.kind === 'idle' ? (
        <p className="mt-6 text-center text-sm text-ink-faint">
          English in, Spanish chunks out.
        </p>
      ) : null}
      <section
        aria-live="polite"
        aria-busy={state.kind === 'loading'}
        className="mt-8 space-y-8"
      >
        {state.kind === 'loading' ? <ResultSkeleton /> : null}
        {state.kind === 'result' ? (
          <Result data={state.data} pending={confidencePending} />
        ) : null}
      </section>
    </main>
  )
}
