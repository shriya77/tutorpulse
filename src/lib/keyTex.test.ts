import { describe, expect, it } from 'vitest'
import { keyTex } from './answerCheck'

describe('keyTex', () => {
  it('formats each kind of key', () => {
    expect(keyTex('6x*cos(3x^2)')).toMatch(/\\cos/)
    expect(keyTex('DNE')).toBe('\\text{DNE}')
    expect(keyTex('-infinity')).toBe('-\\infty')
    expect(keyTex('x = -1, 3')).toBe('x = -1,\\ 3')
    expect(keyTex('±2')).toBe('\\pm 2')
    expect(keyTex('{-1, sqrt(2)}')).toMatch(/\\sqrt\{2\}/)
    expect(keyTex('(-inf, 2) U (3, inf)')).toBe('\\left( -\\infty, 2 \\right) \\cup \\left( 3, \\infty \\right)')
    expect(keyTex('x < 2 or x > 3')).toBe('x < 2 \\ \\text{or}\\ x > 3')
    expect(keyTex('-1 < x <= 4')).toBe('-1 < x \\le 4')
    expect(keyTex('(0, pi/2]')).toMatch(/\\pi/)
  })
  it('is null for a key that can’t be checked', () => expect(keyTex('garbage words here')).toBeNull())
})
