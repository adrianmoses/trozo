import { describe, expect, it } from 'vitest'
import type { NoteKind } from '@trozo/schema'
import {
  NOTE_KIND_LABELS,
  cardNumber,
  cardNumberForId,
  confidenceDisplay,
  noteKindLabel,
  trapsHeading,
  variantsToggleLabel,
} from './labels'

const KINDS: NoteKind[] = [
  'calque',
  'false_friend',
  'preposition',
  'ser_estar',
  'subjunctive_trigger',
  'gender_or_article',
  'register',
  'other',
]

describe('labels', () => {
  it('every note kind has a human label', () => {
    for (const kind of KINDS) {
      expect(noteKindLabel(kind)).toBe(NOTE_KIND_LABELS[kind])
      expect(noteKindLabel(kind)).not.toMatch(/_/)
    }
    expect(noteKindLabel('false_friend')).toBe('False friend')
  })

  it('shows "verified" only for a seed-matched high', () => {
    expect(
      confidenceDisplay({ label: 'high', signals: { seed: true } }),
    ).toEqual({ label: 'high', text: 'verified', verified: true })
    expect(
      confidenceDisplay({ label: 'high', signals: { seed: false } }).text,
    ).toBe('high')
    expect(confidenceDisplay({ label: 'high' }).text).toBe('high')
    expect(confidenceDisplay({ label: 'med' }).text).toBe('medium')
    expect(confidenceDisplay({ label: 'low' }).text).toBe('low')
    expect(confidenceDisplay({ label: 'unrated' }).text).toBe('unrated')
  })

  it('pluralises variants and traps', () => {
    expect(variantsToggleLabel(1, false)).toBe('+ 1 regional variant')
    expect(variantsToggleLabel(3, false)).toBe('+ 3 regional variants')
    expect(variantsToggleLabel(3, true)).toBe('Hide regional variants')
    expect(trapsHeading(1)).toBe('Watch out · 1 trap in this phrase')
    expect(trapsHeading(2)).toBe('Watch out · 2 traps in this phrase')
  })

  it('formats card numbers', () => {
    expect(cardNumber(0)).toBe('01')
    expect(cardNumber(11)).toBe('12')
    expect(cardNumberForId('ch_3')).toBe('03')
    expect(cardNumberForId('weird')).toBe('weird')
  })
})
