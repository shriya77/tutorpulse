/**
 * Light / dark mode. "System" (the default) follows the device setting and
 * changes with it; "Light" and "Dark" stick. The choice lives in this
 * browser's localStorage (a per-device convenience, nothing sensitive). An
 * inline script in index.html applies it before the first paint, so pages
 * don't flash.
 */

export type ColorMode = 'system' | 'light' | 'dark'

const KEY = 'tutorpulse-color-mode'
const LIGHT = 'notebook'
const DARK = 'notebook-night'

export function getColorMode(): ColorMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const prefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches

export function isDark(mode: ColorMode = getColorMode()): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark())
}

function apply(mode: ColorMode) {
  document.documentElement.setAttribute('data-theme', isDark(mode) ? DARK : LIGHT)
}

export function setColorMode(mode: ColorMode) {
  try {
    if (mode === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch {
    // Private mode or blocked storage: still switch for this visit.
  }
  apply(mode)
}

/** Apply the saved mode and follow the device setting while it's "System". */
export function initColorMode() {
  if (typeof window === 'undefined') return
  apply(getColorMode())
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getColorMode() === 'system') apply('system')
  })
}
