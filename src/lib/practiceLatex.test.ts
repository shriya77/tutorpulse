import { describe, expect, it } from 'vitest'
import { buildPracticeLatex, escapeText, isSafeMath } from './practiceLatex'

describe('isSafeMath', () => {
  it('accepts ordinary calculus maths', () => {
    for (const s of [
      '\\frac{d}{dx}\\left(\\sin\\left(5~{ x}^{3}\\right)\\right)',
      '\\lim_{x \\to 2} \\frac{x^2-4}{x-2}',
      '-\\frac{7}{(x-3)^2}',
      '(-\\infty, 2) \\cup (3, \\infty)',
      '\\text{DNE}',
      'x = -1,\\, 3',
    ])
      expect(isSafeMath(s), s).toBe(true)
  })

  it('rejects commands outside the allowlist and TeX tricks', () => {
    for (const s of [
      '\\input{/etc/passwd}',
      '\\write18{ls}',
      '\\immediate\\write18{ls}',
      '\\def\\x{1}',
      '\\csname input\\endcsname',
      '\\catcode`\\@=11',
      'x $ \\input{a} $',
      '^^5cinput{a}',
      'x % comment',
      'a \\\\ b',
      '\\begin{cases}1\\end{cases}',
      '\\frac{1}{x',
      'x}',
      '\\left( x',
      'x\ny',
      'θ',
      '',
    ])
      expect(isSafeMath(s), s).toBe(false)
  })
})

describe('escapeText', () => {
  it('neutralises LaTeX specials so text cannot run commands', () => {
    expect(escapeText('\\input{x} 50% & $5 #1 a_b')).toBe('\\textbackslash{}input\\{x\\} 50\\% \\& \\$5 \\#1 a\\_b')
  })
  it('replaces dashes and drops characters pdflatex cannot set', () => {
    expect(escapeText('Chain rule — inner part')).toBe('Chain rule, inner part')
    expect(escapeText('x² ≠ 2x 你好')).toBe('x\\textsuperscript{2} $\\neq$ 2x')
  })
})

describe('buildPracticeLatex', () => {
  const tex = buildPracticeLatex({
    title: 'Week 4 & chain rule',
    rates: [
      { number: 1, correctRate: 0.5 },
      { number: 2, correctRate: null },
      { number: 3, correctRate: 1 },
    ],
    sections: [
      {
        label: 'Dropped the inner derivative',
        watchFor: 'Multiply by the derivative of the inside.',
        problems: [
          { instruction: 'Find', math: '\\frac{d}{dx}\\sin(3x^2)', answer: '6x\\cos(3x^2)', verified: true },
          { instruction: 'Evaluate.', math: '', answer: '4', verified: false },
        ],
      },
    ],
  })

  it('draws the chart from the exact rates and skips unanswered problems', () => {
    expect(tex).toContain('symbolic x coords={P1,P3}')
    expect(tex).toContain('(P1,50) (P3,100)')
    expect(tex).not.toContain('P2')
  })

  it('escapes the title, lists problems, then answers in the same order', () => {
    expect(tex).toContain('Week 4 \\& chain rule')
    expect(tex.indexOf('\\sin(3x^2)')).toBeLessThan(tex.indexOf('\\section*{Answers}'))
    expect(tex.indexOf('6x\\cos(3x^2)')).toBeLessThan(tex.indexOf('$\\displaystyle 4$'))
    expect(tex).toContain('\\item Evaluate.\n')
  })

  it('has no em or en dashes', () => {
    expect(tex).not.toMatch(/[—–]/)
  })
})
