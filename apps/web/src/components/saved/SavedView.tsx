import { Link } from '@tanstack/react-router'
import { DownloadIcon, Trash2Icon } from 'lucide-react'
import type { Region } from '@trozo/schema'
import { ConfidenceLabel } from '#/components/translator/ConfidenceLabel'
import { RegionPill, RegisterPill } from '#/components/translator/Pills'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { exportHref } from '#/lib/export'
import { REGION_NAMES } from '#/lib/labels'
import { REGIONS } from '#/lib/regions'
import type { SavedFilter, SavedItem } from '#/lib/saved'
import { cn } from '#/lib/utils'

const EXPORTS = [
  { format: 'csv', label: 'Anki (Basic)' },
  { format: 'cloze', label: 'Anki (Cloze)' },
  { format: 'txt', label: 'TXT' },
] as const

/** Tags worth offering as filters: everything but the constant `trozo`. */
function tagOptions(items: SavedItem[], current?: string): string[] {
  const tags = new Set(items.flatMap((item) => item.tags))
  tags.delete('trozo')
  if (current) tags.add(current)
  return [...tags].sort()
}

export function SavedView({
  items,
  filter,
  onFilter,
  onDelete,
}: {
  items: SavedItem[]
  filter: SavedFilter
  onFilter: (filter: SavedFilter) => void
  onDelete: (id: string) => void
}) {
  const filtered = Boolean(filter.region || filter.tag)
  const tags = tagOptions(items, filter.tag)
  return (
    <main className="page-wrap px-4 pt-10 pb-16 sm:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-wider text-ink-faint uppercase">
            Saved
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight font-semibold text-ink">
            Your chunks
          </h1>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Export saved chunks"
        >
          {EXPORTS.map(({ format, label }) => (
            <Button key={format} variant="outline" size="sm" asChild>
              <a href={exportHref(format, filter)} download>
                <DownloadIcon /> {label}
              </a>
            </Button>
          ))}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label htmlFor="saved-region" className="sr-only">
          Region
        </label>
        <select
          id="saved-region"
          value={filter.region ?? ''}
          onChange={(event) =>
            onFilter({
              ...filter,
              region: (event.target.value || undefined) as Region | undefined,
            })
          }
          className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink"
        >
          <option value="">All regions</option>
          {REGIONS.map((value) => (
            <option key={value} value={value}>
              {REGION_NAMES[value]}
            </option>
          ))}
        </select>
        {tags.map((tag) => {
          const active = filter.tag === tag
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onFilter({ ...filter, tag: active ? undefined : tag })
              }
              className={cn(
                'rounded-full border px-2.5 py-0.5 font-mono text-xs',
                active
                  ? 'border-ink bg-ink text-canvas'
                  : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {tag}
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <div className="mt-12 text-center text-sm text-ink-muted">
          {filtered ? (
            <p>
              Nothing matches these filters.{' '}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-ink"
                onClick={() => onFilter({})}
              >
                Clear filters
              </button>
            </p>
          ) : (
            <p>
              Nothing saved yet.{' '}
              <Link to="/" className="underline underline-offset-4">
                Chunk a phrase
              </Link>
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((item) => (
            <SavedRow key={item.id} item={item} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </main>
  )
}

function SavedRow({
  item,
  onDelete,
}: {
  item: SavedItem
  onDelete: (id: string) => void
}) {
  const low = item.confidence === 'low'
  return (
    <li
      data-testid="saved-row"
      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4"
    >
      <div className={cn('min-w-0 flex-1 space-y-1.5', low && 'opacity-60')}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 lang="es" className="font-serif text-xl font-semibold text-ink">
            {item.pattern}
          </h2>
          {item.surface !== item.pattern ? (
            <span lang="es" className="font-serif text-base text-ink-muted">
              {item.surface}
            </span>
          ) : null}
          <span className="flex gap-1">
            {item.regions.map((region) => (
              <RegionPill key={region} region={region} />
            ))}
          </span>
          {item.register && item.register !== 'neutral' ? (
            <RegisterPill register={item.register} />
          ) : null}
        </div>
        <p lang="es" className="text-sm text-ink">
          {item.example_es}
        </p>
        {item.example_en ? (
          <p className="text-sm text-ink-muted">{item.example_en}</p>
        ) : null}
        <p className="text-xs text-ink-faint">
          from “{item.source_text}”
          {item.kind === 'variant' ? ' · regional variant' : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        <ConfidenceLabel confidence={{ label: item.confidence }} />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-ink-muted"
              aria-label={`Delete ${item.surface}`}
            >
              <Trash2Icon /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this saved chunk?</AlertDialogTitle>
              <AlertDialogDescription>
                “{item.surface}” will be removed from your saved list and future
                exports. Cards already imported into Anki are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(item.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  )
}
