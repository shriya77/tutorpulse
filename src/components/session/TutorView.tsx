/**
 * Tutor screens for one session: setup (draft) and the live board (open /
 * closed). The board's numbers come straight from live `useQuery`
 * subscriptions, so new submissions and re-clustered groups appear without a
 * reload (F8, F9).
 */

import { useMemo, useState } from 'react'
import { useMutations } from 'deepspace'
import { Badge, Button } from '@/components/ui'
import type { ClusterData, Envelope, ProblemData, SessionData, SubmissionData } from '../../actions/types'
import { useAnswerKeys, useSessionClusters, useSessionProblems, useSessionSubmissions } from '../../hooks/useSessionData'
import { callAction } from '../../lib/callAction'
import { OTHER_LABEL } from '../../lib/clusters'
import { MathText } from '../MathText'
import { ProblemEditor } from './ProblemEditor'
import { NotesPanel } from './NotesPanel'
import { PracticeSetPanel } from './PracticeSetPanel'
import { TutorRoster } from './TutorRoster'

export function TutorView({ session }: { session: Envelope<SessionData> }) {
  const { problems, status } = useSessionProblems(session.recordId, session.createdBy)
  const { byProblem } = useAnswerKeys()
  const [editing, setEditing] = useState(false)

  if (status === 'loading') return <p className="text-muted-foreground">Loading problems…</p>

  if (session.data.status === 'draft') {
    return (
      <div className="space-y-6">
        <OpenSessionBar session={session} problemCount={problems.length} missingKeys={problems.filter((p) => !byProblem.has(p.recordId)).length} />
        <ProblemEditor sessionId={session.recordId} problems={problems} keys={byProblem} />
        <NotesPanel sessionId={session.recordId} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <LiveHeader session={session} />
      {session.data.status === 'closed' && <PracticeSetPanel session={session} />}
      {session.data.status === 'open' && <TutorRoster session={session} problems={problems} />}
      <Board session={session} problems={problems} />
      <section className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {editing ? 'Done editing problems' : 'Edit problems'}
        </Button>
        {editing && <ProblemEditor sessionId={session.recordId} problems={problems} keys={byProblem} />}
        {editing && session.data.status === 'open' && <NotesPanel sessionId={session.recordId} />}
      </section>
    </div>
  )
}

function OpenSessionBar({ session, problemCount, missingKeys }: { session: Envelope<SessionData>; problemCount: number; missingKeys: number }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function open() {
    setBusy(true)
    setError(null)
    const r = await callAction('openSession', { sessionId: session.recordId })
    setBusy(false)
    if (!r.ok) setError(r.error)
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-foreground">Set up your problems, then open the session.</p>
        <p className="text-sm text-muted-foreground">
          {problemCount} problem{problemCount === 1 ? '' : 's'}
          {missingKeys > 0 && ` · ${missingKeys} missing an answer`}
        </p>
        {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <Button onClick={open} disabled={busy || problemCount === 0} data-testid="open-session">
        {busy ? 'Opening…' : 'Open session'}
      </Button>
    </div>
  )
}

function LiveHeader({ session }: { session: Envelope<SessionData> }) {
  const [busy, setBusy] = useState(false)
  const joined = session.data.participantIds?.length ?? 0
  const live = session.data.status === 'open'
  async function end() {
    if (!window.confirm('End the session? Students can no longer join or submit.')) return
    setBusy(true)
    await callAction('closeSession', { sessionId: session.recordId })
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{live ? 'Join code' : 'Session ended'}</p>
        {live && (
          <p className="font-mono text-4xl font-semibold tracking-[0.25em] text-foreground" data-testid="join-code" aria-label={`Join code ${session.data.joinCode?.split('').join(' ')}`}>
            {session.data.joinCode}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground" data-testid="joined-count">
          {joined} student{joined === 1 ? '' : 's'} joined
        </p>
      </div>
      {live && (
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {session.data.focusLabel && (
            <div className="flex items-center gap-2 text-sm" data-testid="on-board">
              <span className="text-muted-foreground">On the board:</span>
              <span className="font-medium text-foreground">{session.data.focusLabel}</span>
              <ClearBoardButton sessionId={session.recordId} />
            </div>
          )}
          <Button variant="destructive" onClick={end} disabled={busy}>
            End session
          </Button>
        </div>
      )}
    </div>
  )
}

function ClearBoardButton({ sessionId }: { sessionId: string }) {
  const sessions = useMutations<Partial<SessionData>>('sessions')
  return (
    <Button size="sm" variant="ghost" disabled={!sessions.ready} onClick={() => sessions.put(sessionId, { focusLabel: '' })}>
      Clear
    </Button>
  )
}

interface ProblemStats {
  submitted: number
  correct: number
  needsReview: number
}

function Board({ session, problems }: { session: Envelope<SessionData>; problems: Envelope<ProblemData>[] }) {
  const { records: submissions } = useSessionSubmissions(session.recordId)
  const { records: clusters } = useSessionClusters(session.recordId)

  const stats = useMemo(() => {
    const m = new Map<string, ProblemStats>()
    for (const s of submissions as Envelope<SubmissionData>[]) {
      const st = m.get(s.data.problemId) ?? { submitted: 0, correct: 0, needsReview: 0 }
      st.submitted++
      if (s.data.isCorrect === 1) st.correct++
      if (s.data.needsReview === 1) st.needsReview++
      m.set(s.data.problemId, st)
    }
    return m
  }, [submissions])

  const clustersByProblem = useMemo(() => {
    const m = new Map<string, Envelope<ClusterData>[]>()
    for (const c of clusters as Envelope<ClusterData>[]) m.set(c.data.problemId, [...(m.get(c.data.problemId) ?? []), c])
    for (const list of m.values()) {
      list.sort((a, b) => Number(a.data.label === OTHER_LABEL) - Number(b.data.label === OTHER_LABEL) || b.data.count - a.data.count)
    }
    return m
  }, [clusters])

  const submissionById = useMemo(
    () => new Map((submissions as Envelope<SubmissionData>[]).map((s) => [s.recordId, s])),
    [submissions],
  )

  return (
    <ol className="space-y-4" aria-label="Misconception radar">
      {problems.map((p, i) => (
        <li key={p.recordId}>
          <ProblemBoardCard
            index={i}
            problem={p}
            session={session}
            stats={stats.get(p.recordId) ?? { submitted: 0, correct: 0, needsReview: 0 }}
            clusters={clustersByProblem.get(p.recordId) ?? []}
            submissionById={submissionById}
          />
        </li>
      ))}
    </ol>
  )
}

function ProblemBoardCard({
  index, problem, session, stats, clusters, submissionById,
}: {
  index: number
  problem: Envelope<ProblemData>
  session: Envelope<SessionData>
  stats: ProblemStats
  clusters: Envelope<ClusterData>[]
  submissionById: Map<string, Envelope<SubmissionData>>
}) {
  const sessions = useMutations<Partial<SessionData>>('sessions')
  const problems = useMutations<Partial<ProblemData>>('problems')
  const isCurrent = session.data.currentProblemId === problem.recordId
  const locked = problem.data.status === 'locked'
  const live = session.data.status === 'open'
  const grouping = problem.data.clusterState === 'running' || problem.data.clusterState === 'dirty'
  const wrong = stats.submitted - stats.correct

  return (
    <article className={`rounded-xl border bg-card p-5 ${isCurrent ? 'border-primary ring-1 ring-primary' : 'border-border'}`} data-testid="board-problem">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Problem {index + 1}</span>
          {isCurrent && <Badge variant="info">Showing to students</Badge>}
          {locked && <Badge variant="outline">Locked</Badge>}
        </div>
        {live && (
          <div className="flex gap-2">
            {!isCurrent && (
              <Button size="sm" variant="outline" disabled={!sessions.ready} onClick={() => sessions.put(session.recordId, { currentProblemId: problem.recordId })}>
                Show to students
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={!problems.ready} onClick={() => problems.put(problem.recordId, { status: locked ? 'open' : 'locked' })}>
              {locked ? 'Re-open answers' : 'Lock answers'}
            </Button>
          </div>
        )}
      </header>

      <div className="my-3 text-xl text-foreground"><MathText source={problem.data.prompt} display /></div>

      <dl className="grid grid-cols-3 gap-3 text-center" data-testid="problem-stats">
        <Stat label="Submitted" value={stats.submitted} testId="stat-submitted" />
        <Stat label="Correct" value={stats.correct} testId="stat-correct" />
        <Stat label="Not yet correct" value={wrong} testId="stat-wrong" />
      </dl>
      {stats.needsReview > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{stats.needsReview} answer{stats.needsReview === 1 ? '' : 's'} couldn’t be checked automatically (counted as not yet correct).</p>
      )}

      <section className="mt-4 space-y-2" aria-label={`Misconceptions for problem ${index + 1}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">Why answers are wrong</h3>
          {grouping && <span className="text-xs text-muted-foreground" aria-live="polite">Updating groups…</span>}
        </div>
        {clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">{wrong === 0 ? 'No wrong answers yet.' : 'Grouping wrong answers…'}</p>
        ) : (
          <ul className="space-y-2" data-testid="cluster-list">
            {clusters.map((c) => (
              <ClusterItem
                key={c.recordId}
                cluster={c}
                session={session}
                live={live}
                submissionById={submissionById}
              />
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-2xl font-semibold text-foreground" data-testid={testId}>{value}</dd>
    </div>
  )
}

/**
 * One misconception cluster (F11, F12). "Show answers" lists the anonymized
 * answers behind it (answer + explanation, no names). "Take to board" puts
 * its label on every student's screen.
 */
function ClusterItem({
  cluster, session, live, submissionById,
}: {
  cluster: Envelope<ClusterData>
  session: Envelope<SessionData>
  live: boolean
  submissionById: Map<string, Envelope<SubmissionData>>
}) {
  const sessions = useMutations<Partial<SessionData>>('sessions')
  const [open, setOpen] = useState(false)
  const onBoard = session.data.focusLabel === cluster.data.label
  const answers = (cluster.data.submissionIds ?? [])
    .map((id) => submissionById.get(id))
    .filter((s): s is Envelope<SubmissionData> => !!s)
  const panelId = `cluster-answers-${cluster.recordId}`

  return (
    <li className={`rounded-lg border px-3 py-2 ${onBoard ? 'border-info bg-info/10' : 'border-border'}`} data-testid="cluster">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-foreground" data-testid="cluster-label">{cluster.data.label}</span>
        <span className="font-mono text-lg font-semibold text-foreground" data-testid="cluster-count" aria-label={`${cluster.data.count} students`}>
          {cluster.data.count}
        </span>
      </div>
      {cluster.data.explanation && <p className="mt-0.5 text-sm text-muted-foreground">{cluster.data.explanation}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} data-testid="cluster-toggle">
          {open ? 'Hide answers' : `Show answers (${answers.length})`}
        </Button>
        {live && (
          <Button
            size="sm"
            variant={onBoard ? 'secondary' : 'outline'}
            disabled={!sessions.ready}
            onClick={() => sessions.put(session.recordId, { focusLabel: onBoard ? '' : cluster.data.label })}
            data-testid="take-to-board"
          >
            {onBoard ? 'Remove from board' : 'Take to board'}
          </Button>
        )}
      </div>
      {open && (
        <ul id={panelId} className="mt-2 space-y-1 border-t border-border pt-2" data-testid="cluster-answers">
          {answers.length === 0 && <li className="text-sm text-muted-foreground">These answers were revised.</li>}
          {answers.map((s) => (
            <li key={s.recordId} className="text-sm">
              <code className="font-mono text-foreground">{s.data.answer}</code>
              {s.data.explanation && <span className="text-muted-foreground"> — “{s.data.explanation}”</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
