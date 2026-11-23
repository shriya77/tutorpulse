/**
 * Deterministic answer checking (F7). AI never grades.
 *
 * A student's answer is "correct" when it equals the answer key numerically
 * at 5 sample points of x (tolerance 1e-6, relative for large values). So
 * `6x*cos(3x^2)`, `cos(3x²)·6x` and `6x cos(3x^2)` are all correct for the
 * key `6x*cos(3x^2)`, while `cos(3x^2)` is not.
 *
 * The key's form picks the comparison: an expression in x, t or θ (sampled
 * as above), a list of numbers (`x = -1, 3`, any order), a union of intervals
 * (`(-inf, 2) U (3, inf)`, or inequalities), or a limit (`DNE`, `inf`).
 *
 * Input that cannot be parsed safely (prose, unknown functions, anything
 * that fits none of those forms) is `needs_review`: it is kept, sent to
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
/** Variables an answer may use (one per answer), plus the constants pi and e. */
const VARIABLES = ['x', 't', 'theta'] as const
const ALLOWED_SYMBOLS = new Set<string>([...VARIABLES, 'pi', 'e'])
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
    .replace(/θ/g, 'theta')
    .replace(/\*\*/g, '^')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
  for (const [alias, name] of Object.entries(FUNCTION_ALIASES)) {
    s = s.replace(new RegExp(`\\b${alias}\\s*\\(`, 'g'), `${name}(`)
  }
  s = s.replace(/[A-Za-z]+/g, (run) => splitLetters(run) ?? run)
  // A variable/constant directly before "(" means multiply: `x(x^2+2)` is x·(x²+2), not a call.
  s = s.replace(/(?<![A-Za-z])(x|t|theta|e|pi)\s*\(/g, '$1*(')
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
      // Exempt only the function's own name (sin in sin(y)), not its arguments (y).
      const isFunctionName = parent?.type === 'FunctionNode' && (parent as unknown as { fn: MathNode }).fn === n
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

function evaluateAt(compiled: ReturnType<MathNode['compile']>, value: number, variable = 'x'): number | null {
  try {
    const v: unknown = compiled.evaluate({ [variable]: value, ln: Math.log })
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b))
}

/** The variables (x, t, theta) an expression uses. */
function variablesIn(node: MathNode): Set<string> {
  const found = new Set<string>()
  node.traverse((n, _p, parent) => {
    const name = (n as unknown as { name?: string }).name
    const isFunctionName = parent?.type === 'FunctionNode' && (parent as unknown as { fn: MathNode }).fn === n
    if (n.type === 'SymbolNode' && !isFunctionName && name && (VARIABLES as readonly string[]).includes(name)) found.add(name)
  })
  return found
}

/** Expression answers: equal to the key at 5 sample values of its variable (x, t or theta). */
function checkExpression(studentRaw: string, keyRaw: string, seed: number): CheckResult {
  const keyNode = parseSafe(keyRaw)
  if (!keyNode) return { verdict: 'needs_review', reason: 'key_unparsable' }
  const studentNode = parseSafe(studentRaw)
  if (!studentNode) return { verdict: 'needs_review', reason: 'answer_unparsable' }
  const keyVars = variablesIn(keyNode)
  if (keyVars.size > 1) return { verdict: 'needs_review', reason: 'key_has_several_variables' }
  const variable = [...keyVars][0] ?? 'x'
  // Right maths in the wrong letter (x for t) is for the tutor to judge.
  if ([...variablesIn(studentNode)].some((v) => v !== variable)) return { verdict: 'needs_review', reason: 'different_variable' }

  const key = keyNode.compile()
  const student = studentNode.compile()
  const random = mulberry32(seed)

  let compared = 0
  for (let attempt = 0; attempt < 40 && compared < SAMPLE_COUNT; attempt++) {
    const x = SAMPLE_MIN + random() * (SAMPLE_MAX - SAMPLE_MIN)
    const expected = evaluateAt(key, x, variable)
    if (expected === null) continue // key undefined here (e.g. tan near pi/2): pick another point
    const actual = evaluateAt(student, x, variable)
    if (actual === null || !close(actual, expected)) return { verdict: 'incorrect' }
    compared++
  }
  if (compared < SAMPLE_COUNT) return { verdict: 'needs_review', reason: 'too_few_sample_points' }
  return { verdict: 'correct' }
}

/**
 * A derivative question built entirely by code: given a function of x (e.g.
 * from the AI), mathjs writes the prompt and differentiates it for the key,
 * so the key always matches the question. Null if the function isn't a safe
 * allowlisted expression or mathjs can't differentiate it.
 */
export function derivativeProblem(fnRaw: string): { prompt: string; answer: string } | null {
  const node = parseSafe(fnRaw)
  if (!node || !node.toString().includes('x')) return null
  try {
    // mathjs differentiates log(), not ln(): rename before, then check the result is still safe.
    const fn = math.parse(node.toString().replace(/\bln\(/g, 'log('))
    const answer = math.simplify(math.derivative(fn, 'x')).toString({ implicit: 'show' }).replace(/\s+/g, '')
    if (!parseSafe(answer)) return null
    return { prompt: `\\frac{d}{dx}\\left(${tightTex(fn.toTex({ parenthesis: 'auto' }))}\\right)`, answer }
  } catch {
    return null
  }
}

/** mathjs writes implicit products as `5~x` (a visible space); drop it. */
const tightTex = (tex: string) => tex.replace(/~/g, ' ')

/** LaTeX for a safe plain-syntax expression (e.g. "-7/(x-3)^2"), or null. */
export function expressionTex(raw: string): string | null {
  const node = parseSafe(raw)
  if (!node) return null
  try {
    return tightTex(math.parse(node.toString().replace(/\bln\(/g, 'log(')).toTex({ parenthesis: 'auto' }))
  } catch {
    return null
  }
}


// ── Other answer kinds ──────────────────────────────────────────────────────
// The KEY's form decides how an answer is compared, so a tutor just writes the
// key the natural way: "x = -1, 3", "(-inf, 2) U (3, inf)", "DNE", "inf".

export type AnswerKind = 'expression' | 'numbers' | 'intervals' | 'limit'

const SPECIAL: Record<string, 'dne' | 'inf' | '-inf'> = {
  dne: 'dne', doesnotexist: 'dne', doesntexist: 'dne', undefined: 'dne', nolimit: 'dne',
  inf: 'inf', '+inf': 'inf', infinity: 'inf', '+infinity': 'inf', positiveinfinity: 'inf', '∞': 'inf', '+∞': 'inf',
  '-inf': '-inf', '-infinity': '-inf', negativeinfinity: '-inf', '-∞': '-inf',
}

function special(raw: string): 'dne' | 'inf' | '-inf' | null {
  const s = raw.toLowerCase().replace(/^\s*(the\s+)?limit\s*(is|=)?/, '').replace(/[\s'’.]/g, '').replace(/[−–—]/g, '-')
  return SPECIAL[s] ?? null
}

/** A constant (no variable) like `-1`, `sqrt(2)`, `pi/4`, or ±inf. */
function constantValue(raw: string): number | null {
  const sp = special(raw)
  if (sp === 'inf') return Infinity
  if (sp === '-inf') return -Infinity
  if (sp) return null
  const node = parseSafe(raw)
  if (!node || variablesIn(node).size > 0) return null
  try {
    const v: unknown = node.compile().evaluate({ ln: Math.log })
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** `x = -1, 3`, `{-1, 3}`, `x=-1 or x=3`, `±2`: a set of numbers, any order. Null if not that form. */
export function parseNumberList(raw: string): number[] | null {
  if (typeof raw !== 'string' || raw.length > MAX_INPUT_LENGTH) return null
  const s = raw.replace(/[−–—]/g, '-').replace(/^\s*\{(.*)\}\s*$/, '$1')
  const parts = s.split(/,|;|\bor\b|\band\b/i).map((p) => p.replace(/^\s*(x|t|θ|theta)\s*=\s*/i, '').trim()).filter(Boolean)
  if (parts.length === 0) return null
  const values: number[] = []
  for (const part of parts) {
    const pm = part.match(/^(±|\+-|\+\/-)\s*(.+)$/)
    if (pm) {
      const v = constantValue(pm[2])
      if (v === null || !Number.isFinite(v)) return null
      values.push(v, -v)
      continue
    }
    const v = constantValue(part)
    if (v === null || !Number.isFinite(v)) return null
    values.push(v)
  }
  return values.sort((a, b) => a - b)
}

type Interval = { lo: number; hi: number; loClosed: boolean; hiClosed: boolean }

/** Split on top-level commas inside one bracket pair. */
function splitTop(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** One piece: `(a, b]` or an inequality `x < 2`, `x >= -1`, `-1 < x <= 4`. */
function parseIntervalPiece(piece: string): Interval | null {
  const p = piece.trim()
  const br = p.match(/^([[(])(.*)([\])])$/)
  if (br) {
    const parts = splitTop(br[2])
    if (parts.length !== 2) return null
    const lo = constantValue(parts[0])
    const hi = constantValue(parts[1])
    if (lo === null || hi === null || lo > hi) return null
    return { lo, hi, loClosed: br[1] === '[' && Number.isFinite(lo), hiClosed: br[3] === ']' && Number.isFinite(hi) }
  }
  const ineq = p.replace(/≤/g, '<=').replace(/≥/g, '>=')
  const both = ineq.match(/^(.+?)\s*(<=|<)\s*(?:x|t|theta|θ)\s*(<=|<)\s*(.+)$/i)
  if (both) {
    const lo = constantValue(both[1])
    const hi = constantValue(both[4])
    if (lo === null || hi === null || lo > hi) return null
    return { lo, hi, loClosed: both[2] === '<=', hiClosed: both[3] === '<=' }
  }
  const one = ineq.match(/^(?:x|t|theta|θ)\s*(<=|<|>=|>)\s*(.+)$/i)
  if (one) {
    const v = constantValue(one[2])
    if (v === null || !Number.isFinite(v)) return null
    const closed = one[1].endsWith('=')
    return one[1].startsWith('<')
      ? { lo: -Infinity, hi: v, loClosed: false, hiClosed: closed }
      : { lo: v, hi: Infinity, loClosed: closed, hiClosed: false }
  }
  return null
}

/** `(-inf, 2) U (3, inf)`, `[1, 4)`, `x < 2 or x > 3`: a union of intervals. Null if not that form. */
export function parseIntervals(raw: string): Interval[] | null {
  if (typeof raw !== 'string' || raw.length > MAX_INPUT_LENGTH) return null
  const s = raw.replace(/[−–—]/g, '-').replace(/∞/g, 'inf').replace(/infinity/gi, 'inf').replace(/^\s*(x|t|θ|theta)\s*(∈|in)\s*/i, '')
  const pieces = s.split(/∪|\bU\b|\bu\b|\bor\b/i)
  const out: Interval[] = []
  for (const piece of pieces) {
    const iv = parseIntervalPiece(piece)
    if (!iv) return null
    out.push(iv)
  }
  return out.sort((a, b) => a.lo - b.lo || a.hi - b.hi)
}

/** How a key will be checked, or null if it can't be checked automatically. */
export function keyKind(key: string): AnswerKind | null {
  if (special(key)) return 'limit'
  if (/[[(]/.test(key.trim()[0] ?? '') && parseIntervals(key)) return 'intervals'
  if (/[<>≤≥]/.test(key) && parseIntervals(key)) return 'intervals'
  if (/,|;|±|\bor\b|\{/.test(key) && parseNumberList(key)) return 'numbers'
  return parseSafe(key) ? 'expression' : null
}

// ── Display ─────────────────────────────────────────────────────────────────

const VAR_TEX: Record<string, string> = { x: 'x', t: 't', theta: '\\theta', 'θ': '\\theta' }

/** One number or endpoint as TeX: `inf` → ∞, `sqrt(2)` → √2. Falls back to the text as typed. */
function valueTex(raw: string): string {
  const v = raw.trim()
  const sp = special(v)
  if (sp === 'inf') return '\\infty'
  if (sp === '-inf') return '-\\infty'
  return expressionTex(v) ?? `\\text{${v.replace(/[\\{}$&#^_%~]/g, '')}}`
}

const OP_TEX: Record<string, string> = { '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' }

/**
 * How the tutor's key reads as maths, for the problem editor:
 * `6x*cos(3x^2)` → 6x cos(3x²), `(-inf, 2) U (3, inf)` → (−∞, 2) ∪ (3, ∞),
 * `x = -1, 3` → x = −1, 3, `DNE` → DNE. Null if the key can't be checked.
 * Keeps the tutor's own structure (order, brackets, √2 rather than 1.414).
 */
export function keyTex(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const kind = keyKind(raw)
  if (!kind) return null
  if (kind === 'expression') return expressionTex(raw)
  if (kind === 'limit') {
    const sp = special(raw)
    return sp === 'dne' ? '\\text{DNE}' : sp === 'inf' ? '\\infty' : '-\\infty'
  }
  const s = raw.replace(/[−–—]/g, '-').replace(/∞/g, 'inf').replace(/infinity/gi, 'inf').replace(/≤/g, '<=').replace(/≥/g, '>=').trim()
  if (kind === 'numbers') {
    const inner = s.replace(/^\{(.*)\}$/, '$1')
    let variable = ''
    const parts = inner.split(/,|;|\bor\b|\band\b/i).map((p) => p.trim()).filter(Boolean).map((p) => {
      const named = p.match(/^(x|t|θ|theta)\s*=\s*(.+)$/i)
      if (named) {
        variable = VAR_TEX[named[1].toLowerCase()] ?? 'x'
        p = named[2]
      }
      const pm = p.match(/^(±|\+-|\+\/-)\s*(.+)$/)
      return pm ? `\\pm ${valueTex(pm[2])}` : valueTex(p)
    })
    return `${variable ? `${variable} = ` : ''}${parts.join(',\\ ')}`
  }
  // Intervals: bracket pieces joined by ∪, inequality pieces by "or".
  const pieces = s.replace(/^(x|t|θ|theta)\s*(∈|in)\s*/i, '').split(/∪|\bU\b|\bu\b|\bor\b/i).map((p) => p.trim())
  const out = pieces.map((p) => {
    const br = p.match(/^([[(])(.*)([\])])$/)
    if (br) {
      const [lo, hi] = splitTop(br[2])
      return `\\left${br[1]} ${valueTex(lo)}, ${valueTex(hi)} \\right${br[3]}`
    }
    const both = p.match(/^(.+?)\s*(<=|<)\s*(x|t|theta|θ)\s*(<=|<)\s*(.+)$/i)
    if (both) return `${valueTex(both[1])} ${OP_TEX[both[2]]} ${VAR_TEX[both[3].toLowerCase()]} ${OP_TEX[both[4]]} ${valueTex(both[5])}`
    const one = p.match(/^(x|t|theta|θ)\s*(<=|<|>=|>)\s*(.+)$/i)
    if (one) return `${VAR_TEX[one[1].toLowerCase()]} ${OP_TEX[one[2]]} ${valueTex(one[3])}`
    return `\\text{${p.replace(/[\\{}$&#^_%~]/g, '')}}`
  })
  return out.join(/^[[(]/.test(pieces[0] ?? '') ? ' \\cup ' : ' \\ \\text{or}\\ ')
}

const same = (a: number, b: number) => (a === b ? true : Number.isFinite(a) && Number.isFinite(b) && close(a, b))

/** Compare a student's answer with the key, in the form the key is written in. Never throws. */
export function checkAnswer(studentRaw: string, keyRaw: string, seed = 20261121): CheckResult {
  if (typeof studentRaw !== 'string' || typeof keyRaw !== 'string') return { verdict: 'needs_review', reason: 'answer_unparsable' }
  const kind = keyKind(keyRaw)
  if (kind === 'limit') {
    const want = special(keyRaw)
    const got = special(studentRaw)
    if (got) return { verdict: got === want ? 'correct' : 'incorrect' }
    return parseSafe(studentRaw) || parseIntervals(studentRaw) ? { verdict: 'incorrect' } : { verdict: 'needs_review', reason: 'answer_unparsable' }
  }
  if (kind === 'intervals') {
    const want = parseIntervals(keyRaw)!
    const got = parseIntervals(studentRaw)
    if (!got) return parseNumberList(studentRaw) || special(studentRaw) ? { verdict: 'incorrect' } : { verdict: 'needs_review', reason: 'answer_unparsable' }
    const ok =
      got.length === want.length &&
      got.every((g, i) => same(g.lo, want[i].lo) && same(g.hi, want[i].hi) && g.loClosed === want[i].loClosed && g.hiClosed === want[i].hiClosed)
    return { verdict: ok ? 'correct' : 'incorrect' }
  }
  if (kind === 'numbers') {
    const want = parseNumberList(keyRaw)!
    const got = parseNumberList(studentRaw)
    if (!got) return parseIntervals(studentRaw) || special(studentRaw) ? { verdict: 'incorrect' } : { verdict: 'needs_review', reason: 'answer_unparsable' }
    const ok = got.length === want.length && got.every((g, i) => same(g, want[i]))
    return { verdict: ok ? 'correct' : 'incorrect' }
  }
  // A single-number key also accepts the answer written as a one-item list ("x = 2").
  if (kind === 'expression') {
    const res = checkExpression(studentRaw, keyRaw, seed)
    if (res.verdict === 'needs_review' && res.reason === 'answer_unparsable' && special(studentRaw)) return { verdict: 'incorrect' }
    if (res.verdict === 'needs_review' && res.reason === 'answer_unparsable') {
      const k = constantValue(keyRaw)
      const list = k !== null ? parseNumberList(studentRaw) : null
      if (list) return { verdict: list.length === 1 && same(list[0], k!) ? 'correct' : 'incorrect' }
    }
    return res
  }
  return { verdict: 'needs_review', reason: 'key_unparsable' }
}
