import { describe, expect, it } from 'vitest'
import { isPngBytes, workRelativeKey } from './work'

describe('work helpers', () => {
  it('keys one drawing per problem and strips odd characters', () => {
    expect(workRelativeKey('rec_123')).toBe('work/rec_123.png')
    expect(workRelativeKey('../x/y')).toBe('work/_x_y.png')
  })
  it('recognises PNG bytes only', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    expect(isPngBytes(png)).toBe(true)
    expect(isPngBytes(new TextEncoder().encode('<svg onload=alert(1)>'))).toBe(false)
    expect(isPngBytes(new Uint8Array([0x89, 0x50]))).toBe(false)
  })
})
