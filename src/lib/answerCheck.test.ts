import { describe, expect, it } from 'vitest'
import { checkAnswer, derivativeProblem, keyKind, normalizeExpression, parseSafe } from './answerCheck'

/** T6 — answer equivalence. */
describe('checkAnswer (T6)', () => {
  const KEY = '6x*cos(3x^2)'

  it.each([
    '6x*cos(3x^2)',
    'cos(3x^2)*6x',
    '6x cos(3x^2)',
    '6xcos(3x^2)',
    '6·x·cos(3x²)',
    'dy/dx = 6x cos(3x^2)',
    "f'(x) = cos(3*x**2) * 6 * x",
    '  6 * x * cos( 3 * x ^ 2 )  ',
  ])('accepts the equivalent form %j', (answer) => {
    expect(checkAnswer(answer, KEY).verdict).toBe('correct')
  })

  it.each([
    ['cos(3x^2)', 'dropped the inner derivative'],
    ['6x*cos(x^2)', 'differentiated the inside only'],
    ['-6x*cos(3x^2)', 'sign error'],
    ['6x*sin(3x^2)', 'wrong outer derivative'],
    ['6.0001x*cos(3x^2)', 'off by 1.7e-5 relative, outside the 1e-6 tolerance'],
    ['f(x) = x^2', 'only the right-hand side of = is graded'],
  ])('rejects %j (%s)', (answer) => {
    expect(checkAnswer(answer, KEY).verdict).toBe('incorrect')
  })

  it.each([
    'derivative of sin is cos',
    'idk',
    '',
    'y = ',
    'cos(3x^2',
    'foo(x)',
    'x + y',
    'import({})',
    'x.constructor',
    '[1,2,3]',
    '"6x"',
    '5 cm',
    'a'.repeat(300),
  ])('marks %j as needs_review (never correct)', (answer) => {
    expect(checkAnswer(answer, KEY).verdict).toBe('needs_review')
  })

  it('handles algebraically different but equal forms', () => {
    expect(checkAnswer('x + x', '2x').verdict).toBe('correct')
    expect(checkAnswer('2*sin(x)*cos(x)', 'sin(2x)').verdict).toBe('correct')
    expect(checkAnswer('e^(2x)', 'exp(x)^2').verdict).toBe('correct')
    expect(checkAnswer('1/x', 'ln(x)').verdict).toBe('incorrect')
    expect(checkAnswer('1/(2*sqrt(x))', '0.5*x^(-1/2)').verdict).toBe('correct')
    expect(checkAnswer('arctan(x)', 'atan(x)').verdict).toBe('correct')
  })

  it('reads letters typed together and LaTeX braces (seen in realistic class data)', () => {
    expect(checkAnswer('2xe^(x^2)', '2x*e^(x^2)').verdict).toBe('correct')
    expect(checkAnswer('2x e^{x^2}', '2x*e^(x^2)').verdict).toBe('correct')
    expect(checkAnswer('e^{x^2}', '2x*e^(x^2)').verdict).toBe('incorrect')
    expect(checkAnswer('xsin(x)', 'x*sin(x)').verdict).toBe('correct')
    expect(checkAnswer('2cos(x)', '2*cos(x)').verdict).toBe('correct')
    expect(checkAnswer('exp(x)', 'e^x').verdict).toBe('correct')
    expect(checkAnswer('xy', 'x').verdict).toBe('needs_review') // y isn't allowed
    expect(checkAnswer('x(x^2+2)^(-1/2)', 'x/sqrt(x^2+2)').verdict).toBe('correct') // x(…) is multiplication
    expect(checkAnswer('2e(x+1)', '2*e*(x+1)').verdict).toBe('correct')
    expect(checkAnswer('exp(x)', 'e^x').verdict).toBe('correct') // a real function call is untouched
  })

  it('treats an unparsable answer key as a tutor problem, not a student one', () => {
    expect(checkAnswer('6x', 'six x')).toEqual({ verdict: 'needs_review', reason: 'key_unparsable' })
  })

  it('accepts values within the 1e-6 relative tolerance', () => {
    expect(checkAnswer('6.000001x*cos(3x^2)', KEY).verdict).toBe('correct')
  })

  it('is deterministic', () => {
    expect(checkAnswer('cos(3x^2)', KEY)).toEqual(checkAnswer('cos(3x^2)', KEY))
  })
})

describe('normalizeExpression / parseSafe', () => {
  it('rewrites unicode and implicit function products', () => {
    expect(normalizeExpression('6xcos(3x²)')).toBe('6x*cos(3x^2)')
    expect(normalizeExpression('dy/dx = −x')).toBe('-x')
  })

  it('refuses anything outside the allowlist', () => {
    expect(parseSafe('evaluate("1")')).toBeNull()
    expect(parseSafe('cos(x)[1]')).toBeNull()
    // Only the right-hand side of `=` is parsed, so an assignment never reaches mathjs.
    expect(normalizeExpression('x = 3')).toBe('3')
    expect(parseSafe('cos(x)')).not.toBeNull()
  })
})

describe('derivativeProblem (follow-up checks)', () => {
  it('writes the prompt and an exact key from a function', () => {
    const p = derivativeProblem('cos(5x^3)')!
    expect(p.prompt).toContain('\\frac{d}{dx}')
    expect(checkAnswer('-15x^2*sin(5x^3)', p.answer).verdict).toBe('correct')
    expect(checkAnswer('-sin(5x^3)', p.answer).verdict).toBe('incorrect')
  })
  it('handles products, exponentials and ln', () => {
    expect(checkAnswer('2x*e^(4x) + 4x^2*e^(4x)', derivativeProblem('x^2*e^(4x)')!.answer).verdict).toBe('correct')
    expect(checkAnswer('2x/(x^2+1)', derivativeProblem('ln(x^2+1)')!.answer).verdict).toBe('correct')
  })
  it('refuses unsafe or constant input', () => {
    expect(derivativeProblem('import("fs")')).toBeNull()
    expect(derivativeProblem('5')).toBeNull()
    expect(derivativeProblem('')).toBeNull()
  })
})

describe('other answer kinds', () => {
  const v = (student: string, key: string) => checkAnswer(student, key).verdict

  it('lists of numbers, in any order and any common notation', () => {
    expect(keyKind('x = -1, 3')).toBe('numbers')
    for (const s of ['x = 3, x = -1', '{-1, 3}', 'x=-1 or x=3', '3,-1', 'x = −1, 3']) expect(v(s, 'x = -1, 3')).toBe('correct')
    expect(v('x = -1', 'x = -1, 3')).toBe('incorrect')
    expect(v('x = 1, 3', 'x = -1, 3')).toBe('incorrect')
    expect(v('±2', 'x = -2, 2')).toBe('correct')
    expect(v('x = sqrt(2), -sqrt(2)', '±sqrt(2)')).toBe('correct')
  })

  it('a single-number key accepts "x = 2"', () => {
    expect(v('x = 2', '2')).toBe('correct')
    expect(v('x = 3', '2')).toBe('incorrect')
    expect(v('pi/4', 'x = pi/4')).toBe('correct')
  })

  it('intervals and inequalities', () => {
    const key = '(-inf, 2) U (3, inf)'
    expect(keyKind(key)).toBe('intervals')
    for (const s of ['(-∞, 2) ∪ (3, ∞)', 'x < 2 or x > 3', '(3, infinity) U (-infinity, 2)']) expect(v(s, key)).toBe('correct')
    expect(v('(-inf, 2] U (3, inf)', key)).toBe('incorrect')
    expect(v('(-inf, 2)', key)).toBe('incorrect')
    expect(v('[1, 4)', '[1, 4)')).toBe('correct')
    expect(v('1 <= x < 4', '[1, 4)')).toBe('correct')
    expect(v('(1, 4)', '[1, 4)')).toBe('incorrect')
    expect(v('x >= 0', '[0, inf)')).toBe('correct')
    expect(v('x = 2', '(-inf, 2)')).toBe('incorrect')
    expect(v('increasing on the left', '(-inf, 2)')).toBe('needs_review')
  })

  it('limits that are DNE or infinite', () => {
    expect(keyKind('DNE')).toBe('limit')
    expect(v('does not exist', 'DNE')).toBe('correct')
    expect(v("doesn't exist", 'DNE')).toBe('correct')
    expect(v('0', 'DNE')).toBe('incorrect')
    expect(v('∞', 'inf')).toBe('correct')
    expect(v('-infinity', 'inf')).toBe('incorrect')
    expect(v('DNE', '3')).toBe('incorrect')
  })

  it('expressions in t or theta, with the letter checked', () => {
    expect(v('6t*cos(3t^2)', '6t*cos(3t^2)')).toBe('correct')
    expect(v('2θ', '2theta')).toBe('correct')
    expect(v('6x*cos(3x^2)', '6t*cos(3t^2)')).toBe('needs_review')
    expect(v('tan(t)', 'tan(t)')).toBe('correct')
    expect(keyKind('6x*cos(3x^2)')).toBe('expression')
    expect(keyKind('see notes')).toBeNull()
  })

  it('existing expression keys behave as before', () => {
    expect(v('(x+1)^2', 'x^2+2x+1')).toBe('correct')
    expect(keyKind('(x+1)^2')).toBe('expression')
  })
})

describe('allowlist covers function arguments', () => {
  it('rejects unknown names inside a function call', () => {
    expect(parseSafe('sin(y)')).toBeNull()
    expect(parseSafe('cos(import)')).toBeNull()
    expect(parseSafe('sin(x)')).not.toBeNull()
  })
})
