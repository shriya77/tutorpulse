/** Rules for the TutorPulse display name set in Settings. */

export const MAX_DISPLAY_NAME = 40

export type DisplayNameCheck = { ok: true; name: string } | { ok: false; error: string }

/**
 * Tidy and check a display name: trimmed, single spaces, no control or
 * invisible characters, 1 to 40 characters, with at least one letter or digit.
 * An empty string means "use my account name" and is returned as ok with ''.
 */
export function checkDisplayName(raw: unknown): DisplayNameCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'Name must be text' }
  const name = raw
    .normalize('NFC')
    // Control characters, zero-width and bidi-override characters (used to disguise text).
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (name === '') return { ok: true, name: '' }
  if ([...name].length > MAX_DISPLAY_NAME) return { ok: false, error: `Keep it to ${MAX_DISPLAY_NAME} characters` }
  if (!/[\p{L}\p{N}]/u.test(name)) return { ok: false, error: 'Use at least one letter or number' }
  return { ok: true, name }
}
