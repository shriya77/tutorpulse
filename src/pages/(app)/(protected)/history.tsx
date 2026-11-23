/**
 * Tutor history (/history): past sessions and per-student trends across them.
 * Data comes from the `tutorHistory` action, which only reads sessions the
 * caller ran. Unlike the live board, this page names students, so it is for
 * the tutor's own screen, not the projector.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { callAction } from '../../../lib/callAction'
import { historyCsv, type SessionSummary, type StudentTrend } from '../../../lib/history'
import { TOPICS } from '../../../lib/topics'

type History = { sessions: SessionSummary[]; students: StudentTrend[]; topics: string[]; matching: number }

const RANGES = [
  { days: 0, label: 'Any time' },
  { days: 28, label: 'Last 4 weeks' },
  { days: 91, label: 'Last 3 months' },
] as const
const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? id
const weekName = (id: string) => topicLabel(id).split(':')[0]

const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)}%`)
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function HistoryPage() {
  const [data, setData] = useState<History | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(0)
  const [topic, setTopic] = useState('')
  const [topics, setTopics] = useState<string[]>([])

  useEffect(() => {
    let live = true
    setData(null)
    void callAction<History>('tutorHistory', { days: days || undefined, topic: topic || undefined }).then((r) => {
      if (!live) return
      if (r.ok) {
        setData(r.data)
        if (r.data.topics.length) setTopics(r.data.topics)
      } else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [days, topic])

  function download() {
    if (!data) return
    const blob = new Blob([historyCsv(data.students, topicLabel)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tutorpulse-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  const filtered = days > 0 || topic !== ''

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        <h1 className="font-display text-3xl font-semibold text-foreground">Your students over time</h1>
        <p className="text-sm text-muted-foreground">
          Mistakes that keep coming back, and how each student is doing session to session. This page shows names, so keep it off the projector.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter and export">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
          aria-label="Time range"
          data-testid="history-range"
        >
          {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
        </select>
        {(topics.length > 0 || topic) && (
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="h-9 max-w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground"
            aria-label="Course week"
            data-testid="history-topic"
          >
            <option value="">All weeks</option>
            {TOPICS.filter((t) => topics.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" className="sm:ml-auto" onClick={download} disabled={!data || data.students.length === 0} data-testid="history-csv">
          <Download aria-hidden className="size-4" /> Download CSV
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && data.matching > data.sessions.length && (
        <p className="-mt-4 text-xs text-muted-foreground" data-testid="history-capped">
          Showing the newest {data.sessions.length} of {data.matching} sessions. Narrow the range or pick a week to see older ones.
        </p>
      )}

      {data && data.sessions.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground" data-testid="history-empty">
          {filtered ? 'No sessions match these filters.' : 'Nothing yet. Run a session and its results will show up here.'}
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
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {day(s.date)}{s.topic ? ` · ${weekName(s.topic)}` : ''} · {pct(s.correctRate)} correct
                    </span>
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

/**
 * Correct rate per session attended, oldest first (the last 12): one bar per
 * session on a 0–100% scale with a baseline and a 50% guide. 0% is a short
 * solid stub on the baseline; "joined but answered nothing" is a dashed
 * outline, so the two never look alike. Hover or focus a bar for its session,
 * date and score; the latest value is labelled. The CSV is the table view.
 */
function Trend({ points: all }: { points: StudentTrend['bySession'] }) {
  const points = all.slice(-12)
  const [active, setActive] = useState<number | null>(null)
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const shown = active === null ? null : points[active]
  return (
    <figure className="mt-3" data-testid="history-trend">
      <figcaption className="sr-only">Correct rate by session</figcaption>
      <div className="flex gap-2">
        {/* y axis: 100%, 50%, 0 */}
        <div className="flex h-16 flex-col justify-between text-right text-[10px] leading-none text-muted-foreground" aria-hidden>
          <span>100%</span>
          <span>50%</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden />
          <ol className="relative flex h-16 items-end gap-0.5 border-b border-muted-foreground/40" aria-label="Correct rate by session, oldest first">
            {points.map((p, i) => {
              const label = `${p.title}, ${day(p.date)}: ${p.correctRate === null ? 'no answers' : `${p.correct} of ${p.answers} right (${pct(p.correctRate)})`}`
              return (
                <li key={p.sessionId} className="flex h-full min-w-0 flex-1 justify-center" data-testid="trend-bar" data-rate={p.correctRate ?? ''}>
                  <button
                    type="button"
                    className="flex h-full w-full max-w-7 items-end justify-center rounded-sm outline-none hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={label}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    {p.correctRate === null ? (
                      <span className="mb-px h-3 w-3 rounded-t-[4px] border border-dashed border-muted-foreground/70" />
                    ) : (
                      <span
                        className={`w-3 rounded-t-[4px] ${active === i ? 'bg-primary' : 'bg-primary/70'}`}
                        style={{ height: p.correctRate === 0 ? 3 : `${p.correctRate * 100}%` }}
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground" aria-hidden>
            <span>{day(points[0].date)}</span>
            <span>{day(last.date)}</span>
          </div>
        </div>
      </div>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground" aria-live="polite" data-testid="trend-detail">
        {shown
          ? `${shown.title} · ${day(shown.date)} · ${shown.correctRate === null ? 'no answers' : `${shown.correct} of ${shown.answers} right (${pct(shown.correctRate)})`}`
          : `Latest: ${last.correctRate === null ? 'no answers' : pct(last.correctRate)} · hover a bar for details`}
      </p>
    </figure>
  )
}
