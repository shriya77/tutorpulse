/**
 * Builds the practice-set LaTeX document (compiled by the DeepSpace
 * `latex-compiler` integration). The AI only supplies short text and maths
 * snippets; this file owns the document, so:
 *  - the chart is drawn by pgfplots from the session's exact correct rates;
 *  - plain text is escaped, so a title or label can't run LaTeX commands;
 *  - maths snippets must pass `isSafeMath` (an allowlist of maths commands),
 *    so AI output can't use \input, \write, \def and the like.
 */

const MATH_COMMANDS = new Set([
  'frac', 'dfrac', 'tfrac', 'sqrt', 'left', 'right', 'cdot', 'times', 'div', 'pm', 'mp',
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'ln', 'log', 'exp', 'lim', 'to', 'infty', 'int', 'sum', 'prod', 'partial', 'prime',
  'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'approx', 'lt', 'gt', 'in', 'cup', 'cap', 'mid',
  'pi', 'theta', 'alpha', 'beta', 'gamma', 'delta', 'Delta', 'epsilon', 'varepsilon', 'lambda', 'mu', 'sigma', 'phi', 'omega',
  'text', 'mathrm', 'operatorname', 'displaystyle', 'quad', 'qquad', 'dots', 'ldots', 'cdots',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr',
])

/** Control symbols allowed after a backslash: spacing and escaped braces/bars. */
const MATH_SYMBOLS = new Set([',', ';', ':', '!', ' ', '{', '}', '|'])

export const MAX_MATH_LENGTH = 400

/** True if `s` is a maths snippet that is safe to put between $…$. */
export function isSafeMath(s: string): boolean {
  if (typeof s !== 'string' || s.trim() === '' || s.length > MAX_MATH_LENGTH) return false
  // No mode switches, comments, parameters, alignment, catcode tricks or line breaks.
  if (/[$%#&\n\r]|\^\^|\\\\/.test(s)) return false
  if (/[^\x20-\x7e]/.test(s)) return false
  let depth = 0
  let lefts = 0
  let rights = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      const word = /^[a-zA-Z]+/.exec(s.slice(i + 1))?.[0]
      if (word) {
        if (!MATH_COMMANDS.has(word)) return false
        if (word === 'left') lefts++
        if (word === 'right') rights++
        i += word.length
      } else {
        if (!MATH_SYMBOLS.has(s[i + 1] ?? '')) return false
        i += 1
      }
    } else if (c === '{') depth++
    else if (c === '}' && --depth < 0) return false
  }
  return depth === 0 && lefts === rights
}

const TEXT_REPLACEMENTS: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#',
  '%': '\\%', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}',
  '<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}',
  '—': ', ', '–': ', ', '−': '-', '‘': "'", '’': "'", '“': '``', '”': "''", '…': '...',
  '×': '$\\times$', '²': '\\textsuperscript{2}', '³': '\\textsuperscript{3}', '≠': '$\\neq$',
  '≤': '$\\leq$', '≥': '$\\geq$', '∞': '$\\infty$', 'θ': '$\\theta$', 'π': '$\\pi$', '·': '$\\cdot$',
}

/** Plain text made safe for LaTeX. Characters pdflatex can't set are dropped. */
export function escapeText(s: string): string {
  let out = ''
  for (const c of String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim()) {
    if (TEXT_REPLACEMENTS[c]) out += TEXT_REPLACEMENTS[c]
    else if (/[\x20-\x7e]/.test(c) || /[À-ÖØ-öø-ÿ]/.test(c)) out += c
  }
  return out.replace(/ {2,}/g, ' ').trim()
}

export interface PracticeProblem {
  /** Short plain-text instruction, e.g. "Differentiate." */
  instruction: string
  /** Maths for the question (safe, see isSafeMath); may be empty. */
  math: string
  /** Maths for the answer (safe). */
  answer: string
  /** True when the answer was worked out (or checked) by mathjs, not just written by the AI. */
  verified: boolean
}

export interface PracticeSection {
  label: string
  watchFor: string
  problems: PracticeProblem[]
}

export interface PracticeDocInput {
  title: string
  /** Correct rate per session problem, 0 to 1, or null when nobody answered. */
  rates: { number: number; correctRate: number | null }[]
  sections: PracticeSection[]
}

/** The full .tex source. Every piece of text is escaped and every maths snippet must already be safe. */
export function buildPracticeLatex(input: PracticeDocInput): string {
  const answered = input.rates.filter((r) => r.correctRate !== null)
  const chart = answered.length
    ? `\\subsection*{How the group did}
\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[ybar, bar width=18pt, ymin=0, ymax=110, ytick={0,25,50,75,100},
  ylabel={Correct (\\%)}, symbolic x coords={${answered.map((r) => `P${r.number}`).join(',')}}, xtick=data,
  nodes near coords={\\pgfmathprintnumber{\\pgfplotspointmeta}\\%}, every node near coord/.append style={font=\\small},
  width=${Math.min(14, 4 + answered.length * 2)}cm, height=5cm, enlarge x limits=${answered.length > 1 ? 0.2 : 0.6},
  axis lines*=left, ymajorgrids, grid style={gray!25}]
\\addplot[fill=slate!70, draw=slate] coordinates {${answered.map((r) => `(P${r.number},${Math.round((r.correctRate ?? 0) * 100)})`).join(' ')}};
\\end{axis}
\\end{tikzpicture}
\\end{center}
`
    : ''

  const sections = input.sections
    .map((s) => {
      const items = s.problems
        .map((p) => {
          const math = p.math ? ` \\quad $\\displaystyle ${p.math}$` : ''
          return `  \\item ${escapeText(p.instruction)}${math}`
        })
        .join('\n')
      return `\\subsection*{${escapeText(s.label)}}
\\noindent ${escapeText(s.watchFor)}
\\begin{enumerate}[label=\\textbf{\\arabic*.}, resume, itemsep=1.2em, topsep=0.6em]
${items}
\\end{enumerate}`
    })
    .join('\n\n')

  const answers = input.sections
    .flatMap((s) => s.problems)
    .map((p) => `  \\item $\\displaystyle ${p.answer}$`)
    .join('\n')

  return `\\documentclass[11pt]{article}
\\usepackage[a4paper,margin=2.2cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{amsmath,amssymb}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\definecolor{slate}{HTML}{475569}
\\pagestyle{plain}
\\setlength{\\parindent}{0pt}
\\begin{document}
{\\LARGE\\bfseries ${escapeText(input.title) || 'Session'}}\\\\[4pt]
{\\large Practice set}
\\vspace{1em}
${chart}
${sections}

\\newpage
\\section*{Answers}
\\begin{enumerate}[label=\\textbf{\\arabic*.}, itemsep=0.8em]
${answers}
\\end{enumerate}
\\end{document}
`
}
