/**
 * Renders a problem prompt with KaTeX.
 *
 * Tutors may write `$…$` around the math inside a sentence
 * ("Differentiate $\sin(3x^2)$"). A prompt with no `$` is treated as one math
 * expression (`\frac{d}{dx}\sin(3x^2)`), the common case for calculus drills.
 *
 * KaTeX escapes its input and runs with `trust: false` (no \href, \url,
 * \includegraphics), so rendering tutor text as HTML is safe. Output includes
 * MathML for screen readers. Bad LaTeX renders as red source text instead of
 * throwing.
 */

import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type Segment = { math: boolean; text: string }

export function splitMath(source: string): Segment[] {
  if (!source.includes('$')) return [{ math: true, text: source }]
  const parts = source.split('$')
  // Odd positions are inside `$…$`. With an odd number of `$`, the last
  // segment never closed, so show it as plain text (with its `$`).
  const unterminated = parts.length % 2 === 0
  return parts
    .map((text, i) => {
      const dangling = unterminated && i === parts.length - 1
      return { math: i % 2 === 1 && !dangling, text: dangling ? `$${text}` : text }
    })
    .filter((s) => s.text.length > 0)
}

function render(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
    trust: false,
    strict: 'ignore',
    maxSize: 20,
    maxExpand: 200,
  })
}

export function MathText({ source, display = false, className }: { source: string; display?: boolean; className?: string }) {
  const segments = useMemo(() => splitMath(source), [source])
  const onlyMath = segments.length === 1 && segments[0].math
  return (
    <span className={cn('math-text', className)}>
      {segments.map((s, i) =>
        s.math ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: render(s.text, display && onlyMath) }} />
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  )
}
