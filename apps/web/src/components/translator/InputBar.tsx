import { useEffect, useRef, useState } from 'react'
import type { Region } from '@trozo/schema'
import { Button } from '#/components/ui/button'
import { REGION_NAMES } from '#/lib/labels'
import { MAX_PHRASE_LENGTH, REGIONS } from '#/lib/regions'
import { cn } from '#/lib/utils'

/** One-line input that grows into a textarea. Enter submits, Shift+Enter
 * inserts a newline. Empty or over-long text cannot be submitted. */
export function InputBar({
  text: initialText,
  region: initialRegion,
  busy = false,
  onSubmit,
}: {
  text: string
  region: Region
  busy?: boolean
  onSubmit: (text: string, region: Region) => void
}) {
  const [text, setText] = useState(initialText)
  const [region, setRegion] = useState<Region>(initialRegion)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Follow the URL: back/forward and shared links reset the bar.
  useEffect(() => setText(initialText), [initialText])
  useEffect(() => setRegion(initialRegion), [initialRegion])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const trimmed = text.trim()
  const tooLong = trimmed.length > MAX_PHRASE_LENGTH
  const canSubmit = trimmed.length > 0 && !tooLong && !busy

  function submit() {
    if (canSubmit) onSubmit(trimmed, region)
  }

  return (
    <form
      role="search"
      aria-label="Chunk an English phrase"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4"
    >
      <label htmlFor="phrase" className="sr-only">
        English phrase
      </label>
      <textarea
        id="phrase"
        ref={textareaRef}
        rows={1}
        value={text}
        placeholder="Type an English phrase…"
        autoComplete="off"
        spellCheck
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        className="block w-full resize-none bg-transparent px-2 py-2 text-xl leading-snug text-ink outline-none placeholder:text-ink-faint sm:text-2xl"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3 px-1">
        <span
          className={cn(
            'font-mono text-xs',
            tooLong ? 'text-brand-text' : 'text-ink-faint',
          )}
          data-testid="counter"
        >
          {text.length}/{MAX_PHRASE_LENGTH}
        </span>
        <label htmlFor="region" className="sr-only">
          Region
        </label>
        <select
          id="region"
          value={region}
          onChange={(event) => setRegion(event.target.value as Region)}
          className="ml-auto rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink"
        >
          {REGIONS.map((value) => (
            <option key={value} value={value}>
              {REGION_NAMES[value]}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!canSubmit}>
          Chunk it
        </Button>
      </div>
    </form>
  )
}
