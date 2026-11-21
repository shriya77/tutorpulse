import { describe, expect, it } from 'vitest'
import { generateJoinCode, JOIN_CODE_ALPHABET, normalizeJoinCode } from './joinCode'

describe('join codes', () => {
  it('generates 6 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode()
      expect(code).toMatch(new RegExp(`^[${JOIN_CODE_ALPHABET}]{6}$`))
    }
  })

  it('never uses ambiguous characters', () => {
    for (const ch of '0O1IL5S2Z8B') expect(JOIN_CODE_ALPHABET).not.toContain(ch)
  })

  it('normalizes what a student types', () => {
    expect(normalizeJoinCode(' k7q-  xm a ')).toBe('K7QXMA')
    expect(normalizeJoinCode('kq7-xma')).toBe('KQ7XMA')
    expect(normalizeJoinCode('KQ7 XMA')).toBe('KQ7XMA')
  })

  it('rejects wrong length, ambiguous characters and non-strings', () => {
    expect(normalizeJoinCode('KQ7XM')).toBeNull()
    expect(normalizeJoinCode('KQ7XM0')).toBeNull()
    expect(normalizeJoinCode(123456)).toBeNull()
    expect(normalizeJoinCode(undefined)).toBeNull()
  })
})
