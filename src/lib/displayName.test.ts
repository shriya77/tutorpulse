import { describe, expect, it } from 'vitest'
import { checkDisplayName } from './displayName'

describe('checkDisplayName', () => {
  it('tidies spacing and strips invisible characters', () => {
    expect(checkDisplayName('  Maya ​  Lopez \n')).toEqual({ ok: true, name: 'Maya Lopez' })
    expect(checkDisplayName('Ma‮ya')).toEqual({ ok: true, name: 'Maya' }) // bidi override removed
  })
  it('accepts names in any script, with punctuation', () => {
    expect(checkDisplayName("Zoë O'Neil-Ng")).toEqual({ ok: true, name: "Zoë O'Neil-Ng" })
    expect(checkDisplayName('Ana 安娜')).toEqual({ ok: true, name: 'Ana 安娜' })
  })
  it('treats empty as "use my account name"', () => {
    expect(checkDisplayName('   ')).toEqual({ ok: true, name: '' })
  })
  it('refuses junk, very long names and non-text', () => {
    expect(checkDisplayName('!!!').ok).toBe(false)
    expect(checkDisplayName('x'.repeat(41)).ok).toBe(false)
    expect(checkDisplayName('x'.repeat(40)).ok).toBe(true)
    expect(checkDisplayName(42).ok).toBe(false)
  })
})
