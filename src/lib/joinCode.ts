/**
 * Six-character session join codes (F2). The alphabet leaves out characters
 * that are easy to misread on a projector: 0/O, 1/I/L, and 5/S, 2/Z, 8/B.
 */
export const JOIN_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'
export const JOIN_CODE_LENGTH = 6

/** Random code from the alphabet using the platform CSPRNG. */
export function generateJoinCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(JOIN_CODE_LENGTH * 2)
  let code = ''
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % JOIN_CODE_ALPHABET.length)
  for (const b of bytes) {
    if (b >= limit) continue
    code += JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]
    if (code.length === JOIN_CODE_LENGTH) return code
  }
  return generateJoinCode(random) // astronomically rare: too many rejected bytes
}

/** Uppercase, strip spaces and dashes; returns null unless it can be a valid code. */
export function normalizeJoinCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== JOIN_CODE_LENGTH) return null
  for (const ch of code) if (!JOIN_CODE_ALPHABET.includes(ch)) return null
  return code
}
