/**
 * Tutor history (/history): past sessions and per-student trends across them.
 * Data comes from the `tutorHistory` action, which only reads sessions the
 * caller ran. Unlike the live board, this page names students, so it is for
 * the tutor's own screen, not the projector.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui'
import { callAction } from '../../../lib/callAction'
import type { SessionSummary, StudentTrend } from '../../../lib/history'

type History = { sessions: SessionSummary[]; students: StudentTrend[] }

const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)}%`)
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function HistoryPage() {
  const [data, setData] = useState<History | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void callAction<History>('tutorHistory', {}).then((r) => (r.ok ? setData(r.data) : setError(r.error)))
  }, [])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        <h1 className="font-display text-3xl font-semibold text-foreground">Your students over time</h1>
        <p className="text-sm text-muted-foreground">
          Mistakes that keep coming back, and how each student is doing session to session. This page shows names, so keep it off the projector.
        </p>
      </header>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.sessions.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground" data-testid="history-empty">
          Nothing yet. Run a session and its results will show up here.
        </p>
      )}

      {data && data.students.length > 0 && (
        <section className="space-y-3" aria-labelledby="students-title">
          <h2 id="students-title" className="font-display text-lg font-semibold text-foreground">Students</h2>
          <ul className="space-y-3" data-testid="history-students">
            {data.students.map((s) => (
              <li key={s.id} className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgba(29,43,58,0.05)]" data-testid="history-student">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground" data-testid="history-student-name">{s.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.sessions} session{s.sessions === 1 ? '' : 's'} · {s.answers} answer{s.answers === 1 ? '' : 's'} ·{' '}
                    <span className="font-medium text-foreground" data-testid="history-student-rate">{pct(s.correctRate)} correct</span>
                  </span>
                </div>
                <Trend points={s.bySession} />
                {s.mistakes.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {s.mistakes.slice(0, 4).map((m) => (
                      <li key={m.label}>
                        <Badge variant={m.sessions > 1 ? 'warning' : 'outline'} title={m.sessions > 1 ? `In ${m.sessions} sessions` : undefined}>
                          {m.label}
                          {m.sessions > 1 && ` · ${m.sessions} sessions`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No misconception groups so far.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.sessions.length > 0 && (
        <section className="space-y-3" aria-labelledby="sessions-title">
          <h2 id="sessions-title" className="font-display text-lg font-semibold text-foreground">Sessions</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" data-testid="history-sessions">
            {data.sessions.map((s) => (
              <li key={s.id}>
                <Link to={`/sessions/${s.id}`} className="block px-5 py-3.5 transition-colors hover:bg-secondary">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-foreground">{s.title}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">{day(s.date)} · {pct(s.correctRate)} correct</span>
                  </div>
                  {s.topMistakes.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.topMistakes.map((m) => `${m.label} (${m.students})`).join(' · ')}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Correct rate per session as small bars, oldest first (the last 12). */
function Trend({ points: all }: { points: StudentTrend['bySession'] }) {
  const points = all.slice(-12)
  if (points.length < 2) return null
  return (
    <div className="mt-2 flex h-10 items-end gap-1" role="img" aria-label={`Correct rate by session: ${points.map((p) => pct(p.correctRate)).join(', ')}`}>
      {points.map((p) => (
        <div
          key={p.sessionId}
          title={`${p.title} (${day(p.date)}): ${pct(p.correctRate)}`}
          className={`w-3 rounded-sm ${p.correctRate === null ? 'bg-border' : 'bg-primary/70'}`}
          style={{ height: p.correctRate === null ? 4 : `${Math.max(8, p.correctRate * 100)}%` }}
        />
      ))}
    </div>
  )
}
