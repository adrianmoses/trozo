import { describe, expect, it } from 'vitest'
import { cn } from './utils.ts'

describe('cn', () => {
  it('merges conditional classes and resolves tailwind conflicts', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
    expect(cn('px-2', { hidden: false }, 'px-4')).toBe('px-4')
  })
})
