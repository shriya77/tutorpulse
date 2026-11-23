/**
 * /report/:id — a printable record of one session for the tutor: each
 * problem with its key, counts, misconception groups (with the AI's
 * explanation) and most common wrong answers, then every student's results.
 * "Print or save as PDF" uses the browser's own print dialog (no server
 * work, nothing billed). It names students, so it's for the tutor's records,
 * not the projector. Only the session's tutor gets data: RBAC returns the
 * submissions, keys and groups to them alone.
 */

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useUserLookup } from 'deepspace'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui'
import type { ClusterData, Envelope, SubmissionData } from '../../../../actions/types'
import { MathText } from '../../../../components/MathText'
import { KeyMath } from '../../../../components/session/ProblemEditor'
import { useSessionDisplayNames } from '../../../../hooks/useDisplayName'
import { useAnswerKeys, useSessionClusters, useSessionProblems, useSessionRecord, useSessionSubmissions } from '../../../../hooks/useSessionData'
import { OTHER_LABEL } from '../../../../lib/clusters'
import { TOPICS } from '../../../../lib/topics'
import { commonWrongAnswers } from '../../../../lib/wrongAnswers'

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const pct = (n: number, d: number) => (d === 0 ? '–' : `${Math.round((n / d) * 100)}%`)

export default function ReportPage() {
  const { id } = useParams()
  const { userId } = useAuth()
  const { session, status } = useSessionRecord(id)
  if (status === 'loading') return <p className="p-6 text-muted-foreground">Loading report…</p>
  if (!session || session.createdBy !== userId) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-medium text-foreground">Report not found</p>
        <p className="mt-1 text-sm text-muted-foreground">Only the session’s tutor can see its report.</p>
        <Link to="/home" className="mt-4 inline-block text-sm underline">Back to home</Link>
      </div>
    )
  }
  return <Report session={session} />
}

function Report({ session }: { session: NonNullable<ReturnType<typeof useSessionRecord>['session']> }) {
  const sessionId = session.recordId
  const { problems } = useSessionProblems(sessionId, session.createdBy)
  const { byProblem: keys } = useAnswerKeys()
  const { records: subRecords } = useSessionSubmissions(sessionId)
  const { records: clusterRecords } = useSessionClusters(sessionId)
  const submissions = subRecords as Envelope<SubmissionData>[]
  const clusters = clusterRecords as Envelope<ClusterData>[]
  const participantIds = Array.isArray(session.data.participantIds) ? session.data.participantIds : []
  const studentIds = useMemo(() => [...new Set([...participantIds, ...submissions.map((s) => s.data.studentId)])], [participantIds, submissions])
  const names = useSessionDisplayNames(sessionId, studentIds)
  const { getName } = useUserLookup()
  const subById = useMemo(() => new Map(submissions.map((s) => [s.recordId, s])), [submissions])
  const problemIds = new Set(problems.map((p) => p.recordId))
  const mainSubs = submissions.filter((s) => problemIds.has(s.data.problemId))
  const topic = TOPICS.find((t) => t.id === session.data.topic)?.label

  const students = studentIds
    .map((sid) => {
      const mine = mainSubs.filter((s) => s.data.studentId === sid)
      const groups = clusters
        .filter((c) => c.data.label !== OTHER_LABEL && (c.data.submissionIds ?? []).some((x) => subById.get(x)?.data.studentId === sid))
        .map((c) => c.data.label)
      return { id: sid, name: names[sid] || getName(sid) || 'Student', answered: mine.length, right: mine.filter((s) => s.data.isCorrect === 1).length, groups: [...new Set(groups)] }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 text-foreground sm:px-6 print:max-w-none print:p-0" data-testid="session-report">
      <title>{`Report: ${session.data.title}`}</title>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/sessions/${sessionId}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to the session</Link>
        <Button size="sm" onClick={() => window.print()} data-testid="print-report">
          <Printer aria-hidden className="size-4" /> Print or save as PDF
        </Button>
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">TutorPulse session report</p>
        <h1 className="font-display text-3xl font-semibold">{session.data.title}</h1>
        <p className="text-sm text-muted-foreground">
          {longDate(session.createdAt)}
          {topic ? ` · ${topic}` : ''} · {studentIds.length} student{studentIds.length === 1 ? '' : 's'} · {mainSubs.length} answer{mainSubs.length === 1 ? '' : 's'},{' '}
          {pct(mainSubs.filter((s) => s.data.isCorrect === 1).length, mainSubs.length)} right
          {session.data.status === 'open' ? ' · still live' : ''}
        </p>
        <p className="text-xs text-muted-foreground print:block">This report names students. Keep it with your own records.</p>
      </header>

      <section className="space-y-6" aria-label="Problems">
        {problems.map((p, i) => {
          const subs = mainSubs.filter((s) => s.data.problemId === p.recordId)
          const right = subs.filter((s) => s.data.isCorrect === 1).length
          const groups = clusters
            .filter((c) => c.data.problemId === p.recordId)
            .map((c) => ({ c, n: (c.data.submissionIds ?? []).filter((x) => subById.get(x)?.data.isCorrect === 0).length }))
            .filter((g) => g.n > 0)
            .sort((a, b) => Number(a.c.data.label === OTHER_LABEL) - Number(b.c.data.label === OTHER_LABEL) || b.n - a.n)
          const common = commonWrongAnswers(subs.filter((s) => s.data.isCorrect !== 1).map((s) => s.data.answer ?? ''))
          const key = keys.get(p.recordId)?.data.answer
          return (
            <article key={p.recordId} className="break-inside-avoid space-y-2 rounded-xl border border-border p-4" data-testid="report-problem">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">Problem {i + 1}</h2>
                <p className="text-sm text-muted-foreground" data-testid="report-problem-stats">
                  {subs.length} answered · {right} right · {subs.length - right} not yet
                </p>
              </div>
              <div className="text-lg"><MathText source={p.data.prompt} display /></div>
              <p className="text-sm text-muted-foreground">Answer: {key ? <KeyMath answer={key} /> : 'none set'}</p>
              {groups.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Why answers were wrong</h3>
                  <ul className="mt-1 space-y-1.5">
                    {groups.map(({ c, n }) => (
                      <li key={c.recordId} className="text-sm" data-testid="report-group">
                        <span className="font-medium">{c.data.label}</span> <span className="text-muted-foreground">({n})</span>
                        {c.data.explanation && <span className="block text-muted-foreground">{c.data.explanation}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {common.length > 0 && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Most common wrong answers: </span>
                  {common.map((c) => `${c.answer} (${c.count})`).join(', ')}
                </p>
              )}
            </article>
          )
        })}
      </section>

      {students.length > 0 && (
        <section className="break-inside-avoid space-y-2" aria-labelledby="report-students">
          <h2 id="report-students" className="font-display text-xl font-semibold">Students</h2>
          <table className="w-full text-left text-sm" data-testid="report-students">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Name</th>
                <th className="py-1.5 pr-3 font-medium">Answered</th>
                <th className="py-1.5 pr-3 font-medium">Right</th>
                <th className="py-1.5 font-medium">Mistake groups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => (
                <tr key={s.id} data-testid="report-student">
                  <td className="py-1.5 pr-3">{s.name}</td>
                  <td className="py-1.5 pr-3">{s.answered} of {problems.length}</td>
                  <td className="py-1.5 pr-3">{s.right}</td>
                  <td className="py-1.5 text-muted-foreground">{s.groups.join('; ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
