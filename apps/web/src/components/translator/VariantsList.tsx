import { useId, useState } from 'react'
import type { Alternative } from '@trozo/schema'
import { variantsToggleLabel } from '#/lib/labels'
import type { SaveInput } from '#/lib/saved'
import { cn } from '#/lib/utils'
import { ConfidenceLabel } from './ConfidenceLabel'
import { RegionPill, RegisterPill } from './Pills'
import { SaveButton } from './SaveButton'

/** Collapsed "+ n regional variants"; low rows are greyed and their label
 * carries a "check this" tooltip; unrated rows spin while full confidence is
 * pending. */
export function VariantsList({
  alternatives,
  pending = false,
  saveRow,
}: {
  alternatives: Alternative[]
  pending?: boolean
  /** Builds the save payload for a variant row; enables per-row Save. */
  saveRow?: (alt: Alternative) => SaveInput
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (alternatives.length === 0) return null
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {variantsToggleLabel(alternatives.length, open)}
      </button>
      {open ? (
        <ul id={listId} className="mt-2 divide-y divide-line">
          {alternatives.map((alt, i) => {
            const low = alt.confidence.label === 'low'
            return (
              <li
                key={i}
                data-variant-confidence={alt.confidence.label}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm',
                  low && 'opacity-60',
                )}
              >
                <span className="flex gap-1">
                  {alt.regions.map((region) => (
                    <RegionPill key={region} region={region} />
                  ))}
                </span>
                <span
                  lang="es"
                  className="flex-1 font-serif text-base text-ink"
                >
                  {alt.surface}
                </span>
                {alt.register && alt.register !== 'neutral' ? (
                  <RegisterPill register={alt.register} />
                ) : null}
                <ConfidenceLabel
                  confidence={alt.confidence}
                  pending={pending}
                />
                {saveRow ? <SaveButton row={saveRow(alt)} compact /> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
