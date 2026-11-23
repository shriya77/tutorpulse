import { describe, expect, it } from 'vitest'
import { isCleanJpegBytes, isPngBytes, workImageType, workPhotoRelativeKey, workRelativeKey } from './work'

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

describe('photo checks', () => {
  const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xda, 0x00, 0x08])
  const exifHeader = [0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]
  const exif = new Uint8Array([0xff, 0xd8, ...exifHeader, 0xff, 0xda, 0x00, 0x08])
  it('accepts a re-encoded JPEG and refuses one carrying EXIF (e.g. GPS)', () => {
    expect(isCleanJpegBytes(jfif)).toBe(true)
    expect(isCleanJpegBytes(exif)).toBe(false)
    expect(workImageType(jfif)).toBe('image/jpeg')
    expect(workImageType(exif)).toBeNull()
    expect(workImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  })
  it('photo and drawing use different keys', () => {
    expect(workPhotoRelativeKey('p1')).toBe('work/p1-photo.jpg')
    expect(workRelativeKey('p1')).toBe('work/p1.png')
  })
})
