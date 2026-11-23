import { describe, expect, it } from 'vitest'
import { shortDate } from './dates'
import { copyTitle } from '../actions/duplicate-session'

describe('shortDate', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  it('leaves the year off this year and shows it for other years', () => {
    expect(shortDate('2026-11-21T10:00:00Z', now)).not.toMatch(/2026/)
    expect(shortDate('2025-03-02T10:00:00Z', now)).toMatch(/2025/)
  })
  it('is empty for a bad date', () => expect(shortDate('nope', now)).toBe(''))
})

describe('copyTitle', () => {
  it('adds (copy) once, even when copying a copy', () => {
    expect(copyTitle('Chain rule')).toBe('Chain rule (copy)')
    expect(copyTitle('Chain rule (copy)')).toBe('Chain rule (copy)')
  })
  it('stays within 120 characters', () => {
    const t = copyTitle('x'.repeat(120))
    expect(t.length).toBeLessThanOrEqual(120)
    expect(t.endsWith('… (copy)')).toBe(true)
  })
})
