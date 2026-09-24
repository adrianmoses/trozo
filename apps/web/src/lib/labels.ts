import type { ConfidenceLabel, NoteKind, Region } from '@trozo/schema'

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  calque: 'Calque',
  false_friend: 'False friend',
  preposition: 'Preposition',
  ser_estar: 'Ser/estar',
  subjunctive_trigger: 'Subjunctive trigger',
  gender_or_article: 'Gender/article',
  register: 'Register',
  other: 'Other',
}

export function noteKindLabel(kind: NoteKind): string {
  return NOTE_KIND_LABELS[kind]
}

/** Long names for the region selector; pills show the short code. */
export const REGION_NAMES: Record<Region, string> = {
  neutral: 'Neutral',
  ES: 'Spain',
  MX: 'Mexico',
  AR: 'Argentina',
  CO: 'Colombia',
}

export interface ConfidenceDisplay {
  label: ConfidenceLabel
  /** Always present: confidence never relies on colour alone. */
  text: string
  /** Seed-matched `high`: the design doc's "verified" badge. */
  verified: boolean
}

export function confidenceDisplay(confidence: {
  label: ConfidenceLabel
  signals?: { seed?: boolean }
}): ConfidenceDisplay {
  const verified =
    confidence.label === 'high' && confidence.signals?.seed === true
  const text = verified
    ? 'verified'
    : confidence.label === 'med'
      ? 'medium'
      : confidence.label
  return { label: confidence.label, text, verified }
}

export function variantsToggleLabel(count: number, expanded: boolean): string {
  const noun = count === 1 ? 'regional variant' : 'regional variants'
  return expanded ? `Hide ${noun}` : `+ ${count} ${noun}`
}

export function trapsHeading(count: number): string {
  return `Watch out · ${count} ${count === 1 ? 'trap' : 'traps'} in this phrase`
}

/** Two-digit card number from a 0-based index. */
export function cardNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/** "ch_3" → "03"; unknown ids fall back to the raw id. */
export function cardNumberForId(id: string): string {
  const m = /^ch_(\d+)$/.exec(id)
  return m ? m[1].padStart(2, '0') : id
}
