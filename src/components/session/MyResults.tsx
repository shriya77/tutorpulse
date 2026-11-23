/**
 * Student end screen: their own results, problem by problem, once the
 * session has ended (while it's live they never see whether they were right).
 * Comes from the `myResults` action, which returns only the caller's own
 * answers and the name of the mistake group each wrong one was in.
 */

import { useEffect, useState } from 'react'
import { Check, CircleDashed, Eye, X } from 'lucide-react'
import type { RecapProblem } from '../../lib/recapEmail'
import { callAction } from '../../lib/callAction'
import { MathText } from '../MathText'

type Result = RecapProblem & { prompt: string }

export function MyResults({ sessionId }: { sessionId: string }) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void callAction<{ results: Result[] }>('myResults', { sessionId }).then((r) => {
      if (!live) return
      if (r.ok) setResults(r.data.results)
      else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [sessionId])

  if (error) return <p role="alert" className="text-sm text-destructive">Could not load your results: {error}</p>
  if (!results) return <p className="text-sm text-muted-foreground">Loading your results…</p>
  if (results.length === 0) return null

  const right = results.filter((r) => r.status === 'correct').length
  const toCheck = results.filter((r) => r.status === 'needs_review').length

  return (
    <section className="text-left" aria-labelledby="my-results-heading" data-testid="my-results">
      <h2 id="my-results-heading" className="font-display text-lg font-semibold text-foreground">Your results</h2>
      <p className="mt-0.5 text-sm text-muted-foreground" data-testid="my-results-summary">
        {right} of {results.length} right{toCheck > 0 ? `, ${toCheck} for your tutor to check` : ''}.
      </p>
      <ol className="mt-3 space-y-2">
        {results.map((r) => (
          <li key={r.number} className="rounded-xl border border-border bg-background/60 p-3" data-testid="my-result" data-status={r.status}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Problem {r.number}</p>
                <div className="overflow-x-auto text-foreground">
                  <MathText source={r.prompt} />
                </div>
              </div>
              <Badge status={r.status} />
            </div>
            {r.answer && (
              <p className="mt-2 text-sm text-muted-foreground">
                Your answer: <span className="break-all font-mono text-foreground">{r.answer}</span>
              </p>
            )}
            {r.mistake && (
              <p className="mt-1 text-sm text-foreground" data-testid="my-result-mistake">
                <span className="text-muted-foreground">Mistake to watch for: </span>
                <span className="hl font-medium">{r.mistake}</span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Badge({ status }: { status: RecapProblem['status'] }) {
  const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium'
  switch (status) {
    case 'correct':
      return <span className={`${base} bg-success/10 text-success`}><Check className="size-3.5" aria-hidden />Right</span>
    case 'incorrect':
      return <span className={`${base} bg-highlight/40 text-foreground`}><X className="size-3.5" aria-hidden />Not yet</span>
    case 'needs_review':
      return <span className={`${base} bg-secondary text-foreground`}><Eye className="size-3.5" aria-hidden />Tutor will check</span>
    case 'not_answered':
      return <span className={`${base} bg-secondary text-muted-foreground`}><CircleDashed className="size-3.5" aria-hidden />Not answered</span>
  }
}
