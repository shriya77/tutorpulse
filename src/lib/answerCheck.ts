/**
 * Deterministic answer checking (F7). AI never grades.
 *
 * A student's answer is "correct" when it equals the answer key numerically
 * at 5 sample points of x (tolerance 1e-6, relative for large values). So
 * `6x*cos(3x^2)`, `cos(3x²)·6x` and `6x cos(3x^2)` are all correct for the
 * key `6x*cos(3x^2)`, while `cos(3x^2)` is not.
 *
 * Input that cannot be parsed safely (prose, unknown functions, anything
 * that is not a plain expression in x) is `needs_review`: it is kept, sent to
 * clustering with its raw text, and never marked correct.
 *
 * Safety: student text is untrusted. It is parsed (never `evaluate`d as a
 * string), and the parse tree must contain only numbers, operators,
 * parentheses, the variable x, the constants pi/e, and an allowlist of
 * functions. Assignments, property access, `import`, matrices, strings,
 * units etc. are all rejected before anything is evaluated.
 */

import { create, all, type MathNode } from 'mathjs'

export type Verdict = 'correct' | 'incorrect' | 'needs_review'

export interface CheckResult {
  verdict: Verdict
  /** Short machine-readable reason for needs_review / incorrect. */
  reason?: string
}

export const SAMPLE_COUNT = 5
export const TOLERANCE = 1e-6
/** Sample x in [0.5, 2.5]: avoids x=0 (division, log) and stays where trig/exp are well-behaved. */
const SAMPLE_MIN = 0.5
const SAMPLE_MAX = 2.5
const MAX_INPUT_LENGTH = 200

const math = create(all, {})

/** Functions a calculus answer may use. Anything else → needs_review. */
const ALLOWED_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'exp', 'log', 'ln', 'log10', 'sqrt', 'cbrt', 'abs',
])
const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e'])
const ALLOWED_NODE_TYPES = new Set([
  'ConstantNode', 'SymbolNode', 'OperatorNode', 'ParenthesisNode', 'FunctionNode',
])

/** Aliases students commonly type, mapped onto mathjs names. */
const FUNCTION_ALIASES: Record<string, string> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan' }
const FUNCTION_NAMES = [...ALLOWED_FUNCTIONS, ...Object.keys(FUNCTION_ALIASES)]
  .sort((a, b) => b.length - a.length)
  .join('|')

/**
 * Turn what a student types into mathjs syntax:
 * - keep only the right-hand side of `dy/dx = …` / `f'(x) = …`;
 * - unicode superscripts, ×, ·, − → ascii; LaTeX-style `{…}` → `(…)`;
 * - runs of letters are split into the names we allow, so `6xcos(…)` →
 *   `6x*cos(…)` and `2xe^(x^2)` → `2x*e^(x^2)` (mathjs would otherwise read
 *   `xcos` / `xe` as one unknown name). A run that can't be split is left
 *   alone and fails the allowlist later (→ needs_review).
 */
export function normalizeExpression(raw: string): string {
  let s = raw.trim()
  const eq = s.lastIndexOf('=')
  if (eq >= 0) s = s.slice(eq + 1)
  s = s
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => '^' + [...m].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''))
    .replace(/[·×∙⋅]/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/\*\*/g, '^')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
  for (const [alias, name] of Object.entries(FUNCTION_ALIASES)) {
    s = s.replace(new RegExp(`\\b${alias}\\s*\\(`, 'g'), `${name}(`)
  }
  s = s.replace(/[A-Za-z]+/g, (run) => splitLetters(run) ?? run)
  // A variable/constant directly before "(" means multiply: `x(x^2+2)` is x·(x²+2), not a call.
  s = s.replace(/(?<![A-Za-z])(x|e|pi)\s*\(/g, '$1*(')
  // A number or closing paren directly before a function name: `2cos(x)`, `(x)sin(x)`.
  s = s.replace(new RegExp(`([0-9)])\\s*(${FUNCTION_NAMES})\\s*\\(`, 'g'), '$1*$2(')
  return s.trim()
}

const NAMES = [...ALLOWED_FUNCTIONS, ...ALLOWED_SYMBOLS].sort((a, b) => b.length - a.length)

/** Split a run of letters into allowed names, longest match first ("xcos" → "x*cos"). */
function splitLetters(run: string): string | null {
  if (NAMES.includes(run)) return run
  const parts: string[] = []
  let rest = run
  while (rest) {
    const name = NAMES.find((n) => rest.startsWith(n))
    if (!name) return null
    parts.push(name)
    rest = rest.slice(name.length)
  }
  return parts.join('*')
}

/** Parse untrusted text into an allowlisted expression tree, or null. */
export function parseSafe(raw: string): MathNode | null {
  if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > MAX_INPUT_LENGTH) return null
  let node: MathNode
  try {
    node = math.parse(normalizeExpression(raw))
  } catch {
    return null
  }
  let safe = true
  node.traverse((n, _path, parent) => {
    if (!ALLOWED_NODE_TYPES.has(n.type)) safe = false
    else if (n.type === 'FunctionNode') {
      const fn = (n as unknown as { fn: MathNode & { name?: string } }).fn
      if (fn.type !== 'SymbolNode' || !ALLOWED_FUNCTIONS.has(fn.name ?? '')) safe = false
    } else if (n.type === 'SymbolNode') {
      const isFunctionName = parent?.type === 'FunctionNode'
      const name = (n as unknown as { name: string }).name
      if (!isFunctionName && !ALLOWED_SYMBOLS.has(name)) safe = false
    } else if (n.type === 'ConstantNode') {
      if (typeof (n as unknown as { value: unknown }).value !== 'number') safe = false
    }
  })
  return safe ? node : null
}

/** Small seeded PRNG so the sample points are random but reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function evaluateAt(compiled: ReturnType<MathNode['compile']>, x: number): number | null {
  try {
    const v: unknown = compiled.evaluate({ x, ln: Math.log })
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b))
}

/** Compare a student's answer with the key. Never throws. */
export function checkAnswer(studentRaw: string, keyRaw: string, seed = 20261121): CheckResult {
  const keyNode = parseSafe(keyRaw)
  if (!keyNode) return { verdict: 'needs_review', reason: 'key_unparsable' }
  const studentNode = parseSafe(studentRaw)
  if (!studentNode) return { verdict: 'needs_review', reason: 'answer_unparsable' }

  const key = keyNode.compile()
  const student = studentNode.compile()
  const random = mulberry32(seed)

  let compared = 0
  for (let attempt = 0; attempt < 40 && compared < SAMPLE_COUNT; attempt++) {
    const x = SAMPLE_MIN + random() * (SAMPLE_MAX - SAMPLE_MIN)
    const expected = evaluateAt(key, x)
    if (expected === null) continue // key undefined here (e.g. tan near pi/2): pick another point
    const actual = evaluateAt(student, x)
    if (actual === null || !close(actual, expected)) return { verdict: 'incorrect' }
    compared++
  }
  if (compared < SAMPLE_COUNT) return { verdict: 'needs_review', reason: 'too_few_sample_points' }
  return { verdict: 'correct' }
}
