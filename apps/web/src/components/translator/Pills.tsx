import type { Region, Register } from '@trozo/schema'
import { cn } from '#/lib/utils'

export function RegionPill({ region }: { region: Region }) {
  return (
    <span
      className={cn(
        'rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-ink-muted',
        region !== 'neutral' && 'uppercase',
      )}
    >
      {region}
    </span>
  )
}

export function RegisterPill({ register }: { register: Register }) {
  return (
    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] leading-4 text-ink-muted">
      {register}
    </span>
  )
}

export function SlotPill({ slot }: { slot: string }) {
  return (
    <span className="rounded-md border border-dashed border-line-strong px-2 py-0.5 font-mono text-xs text-ink-muted">
      {slot}
    </span>
  )
}
