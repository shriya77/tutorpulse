/**
 * Handwritten working (whiteboard) helpers shared by the browser and worker.
 * The PNG lives in the student's PRIVATE folder at a fixed per-problem key,
 * so a revision replaces the old drawing instead of piling up files.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Relative key (inside the student's own folder) for one problem's working. */
export function workRelativeKey(problemId: string): string {
  return `work/${problemId.replace(/[^\w-]+/g, '_').slice(0, 64)}.png`
}

/** True when the bytes start with the PNG file signature. */
export function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b)
}

/** Relative key for a PHOTO of paper working (a separate file from the drawing). */
export function workPhotoRelativeKey(problemId: string): string {
  return `work/${problemId.replace(/[^\w-]+/g, '_').slice(0, 64)}-photo.jpg`
}

/**
 * True for a JPEG that carries no EXIF block. Phone photos keep EXIF
 * (including GPS location); the app re-encodes photos on the student's phone,
 * which drops it, so a JPEG that still has EXIF did not come from the app and
 * is refused rather than passing a location on to the tutor.
 */
export function isCleanJpegBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return false
    const marker = bytes[i + 1]
    if (marker === 0xda) return true // start of scan: the headers are over
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2) return false
    if (marker === 0xe1) {
      const id = String.fromCharCode(...bytes.subarray(i + 4, i + 10))
      if (id.startsWith('Exif') || id.startsWith('http')) return false // EXIF or XMP metadata
    }
    i += 2 + len
  }
  return false
}

/** The working image's media type, or null if it isn't one we accept. */
export function workImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (isPngBytes(bytes)) return 'image/png'
  if (isCleanJpegBytes(bytes)) return 'image/jpeg'
  return null
}
