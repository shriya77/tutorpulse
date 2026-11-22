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
