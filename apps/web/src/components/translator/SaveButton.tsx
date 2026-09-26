import { useQuery } from '@tanstack/react-query'
import { BookmarkIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { savedKey } from '#/lib/saved'
import type { SaveInput } from '#/lib/saved'
import { savedIndexQueryOptions, useSaveMutation } from '#/lib/saved-query'
import { cn } from '#/lib/utils'

/** Save → Saving… → Saved ✓. "Saved" is final here; removal happens on
 * /saved (spec 004, Non-Goals). Saved state comes from the saved index, so it
 * survives reloads and back/forward. */
export function SaveButton({
  row,
  compact = false,
  className,
}: {
  row: SaveInput
  compact?: boolean
  className?: string
}) {
  const index = useQuery(savedIndexQueryOptions())
  const save = useSaveMutation()
  const saved =
    index.data?.keys.includes(savedKey(row.surface, row.example_es)) ?? false
  const label = saved ? 'Saved ✓' : save.isPending ? 'Saving…' : 'Save'
  return (
    <Button
      type="button"
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'xs' : 'default'}
      disabled={saved || save.isPending}
      aria-label={compact ? `${label}: ${row.surface}` : undefined}
      onClick={() => save.mutate(row)}
      className={cn(saved && 'disabled:opacity-100', className)}
    >
      {saved || compact ? null : <BookmarkIcon />}
      <span aria-live="polite">{label}</span>
    </Button>
  )
}
