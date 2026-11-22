/**
 * Student screen (F5, F6): the problem the tutor is showing, rendered with
 * KaTeX; an answer + one-line explanation; "Submitted ✓" with revisions until
 * the tutor locks the problem. The student never sees whether they were
 * right, other students' work, or the answer key — and the data layer
 * enforces that, not this component (see tests/privacy.spec.ts).
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useAuth, usePresenceRoom, useQuery } from 'deepspace'
import { Button, Input, Label } from '@/components/ui'
import type { Envelope, SessionData, SubmissionData } from '../../actions/types'
import { useSessionProblems } from '../../hooks/useSessionData'
import { callAction } from '../../lib/callAction'
import { MathText } from '../MathText'
import { HintPanel } from './HintPanel'
import { PracticeSetLink } from './PracticeSetLink'

/** What a student shares with the tutor's live roster (F10). Ephemeral, never stored. */
export interface StudentPresence {
  problemId: string | null
  submitted: boolean
  stuck: boolean
}

export function StudentView({ session }: { session: Envelope<SessionData> }) {
  const { problems, status } = useSessionProblems(session.recordId, session.createdBy)
  // RBAC returns only this student's own submissions.
  const { records: mySubmissions } = useQuery<SubmissionData>('submissions', { where: { sessionId: session.recordId } })
  const [stuck, setStuck] = useState(false)
  const { connected, updateState } = usePresenceRoom(`session:${session.recordId}`)
  const { userId } = useAuth()

  const index = problems.findIndex((p) => p.recordId === session.data.currentProblemId)
  const problem = problems[index]
  const mine = problem ? mySubmissions.find((s) => s.data.problemId === problem.recordId) : undefined
  const presence: StudentPresence = { problemId: problem?.recordId ?? null, submitted: !!mine, stuck }

  // Re-send whenever it changes AND after every reconnect (a reconnect clears our state).
  useEffect(() => {
    if (connected) updateState({ ...presence })
  }, [connected, presence.problemId, presence.submitted, presence.stuck])

  // A new problem starts un-stuck.
  useEffect(() => setStuck(false), [problem?.recordId])

  if (session.data.status === 'closed') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-lg font-medium text-foreground">This session has ended.</p>
        <p className="mt-1 text-sm text-muted-foreground">Thanks for taking part.</p>
        <PracticeSetLink sessionId={session.recordId} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {session.data.focusLabel && (
        <div role="status" className="rounded-xl border border-info bg-info/15 px-4 py-3 text-foreground" data-testid="focus-banner">
          <span className="text-sm font-medium">Discussing: </span>
          {session.data.focusLabel}
        </div>
      )}
      {status === 'loading' ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !problem ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          Waiting for your tutor to show a problem…
        </div>
      ) : (
        <>
          <AnswerCard
            key={problem.recordId}
            problemId={problem.recordId}
            number={index + 1}
            prompt={problem.data.prompt}
            locked={problem.data.status === 'locked'}
            mine={mine}
            onSubmitted={() => setStuck(false)}
          />
          <Button
            type="button"
            variant={stuck ? 'secondary' : 'outline'}
            aria-pressed={stuck}
            onClick={() => setStuck((v) => !v)}
            data-testid="stuck-button"
          >
            {stuck ? 'Tutor notified — tap if you’re unstuck' : 'I’m stuck'}
          </Button>
          {userId && <HintPanel userId={userId} />}
        </>
      )}
    </div>
  )
}

function AnswerCard({
  problemId, number, prompt, locked, mine, onSubmitted,
}: {
  problemId: string
  number: number
  prompt: string
  locked: boolean
  mine?: Envelope<SubmissionData>
  onSubmitted: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Prefill with the saved answer once it arrives, so revising starts from it.
  useEffect(() => {
    if (mine && !answer && !explanation) {
      setAnswer(mine.data.answer)
      setExplanation(mine.data.explanation ?? '')
    }
  }, [mine?.recordId])

  const unchanged = mine && mine.data.answer === answer.trim() && (mine.data.explanation ?? '') === explanation.trim()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const r = await callAction<{ revision: number }>('submitAnswer', { problemId, answer, explanation })
    setBusy(false)
    if (!r.ok) setError(r.error)
    else onSubmitted()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="problem-heading">
      <h2 id="problem-heading" className="text-sm font-medium text-muted-foreground">Problem {number}</h2>
      {/* Long expressions scroll sideways on phones; the edge fade hints that there is more. */}
      <div
        className="overflow-x-auto text-lg text-foreground sm:text-2xl [mask-image:linear-gradient(to_right,black_92%,transparent)] sm:[mask-image:none]"
        data-testid="student-problem"
        tabIndex={0}
        aria-label={`Problem ${number}`}
      >
        <MathText source={prompt} display />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="answer">Your final answer</Label>
        <Input
          id="answer"
          data-testid="answer-input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="e.g. 3x^2 + 2"
          disabled={locked}
          maxLength={200}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="font-mono"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="explanation">How did you get it? (one line)</Label>
        <Input
          id="explanation"
          data-testid="explanation-input"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="e.g. used the power rule on each term"
          disabled={locked}
          maxLength={280}
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={locked || busy || !answer.trim() || !!unchanged} data-testid="submit-answer">
          {busy ? 'Saving…' : mine ? 'Update answer' : 'Submit'}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="submit-status">
          {locked
            ? 'Answers are locked for this problem.'
            : mine
              ? `Submitted ✓${mine.data.revision > 1 ? ` (revision ${mine.data.revision})` : ''}`
              : ''}
        </span>
      </div>
    </form>
  )
}
