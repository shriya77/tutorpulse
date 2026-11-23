/**
 * Home: join a session by code (students) or start / reopen one (tutors).
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth, useMutations, useQuery } from 'deepspace'
import { DoorOpen, PenLine } from 'lucide-react'
import { Badge, Button, Input, Label } from '@/components/ui'
import type { Envelope, SessionData } from '../../actions/types'
import { callAction } from '../../lib/callAction'
import { normalizeJoinCode } from '../../lib/joinCode'
import { shortDate } from '../../lib/dates'

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  if (!isSignedIn) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
        <Hero />
        <Button size="lg" onClick={() => setShowAuth(true)}>
          Sign in to join or run a session
        </Button>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
      <Hero />
      <div className="grid gap-6 md:grid-cols-2">
        <JoinCard />
        <NewSessionCard />
      </div>
      <SessionLists />
    </div>
  )
}

function Hero() {
  return (
    <header className="space-y-3">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        See <span className="hl">why</span> they got it wrong.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Live group tutoring: answers checked instantly, wrong ones grouped by misconception while the session is still running.
      </p>
    </header>
  )
}

function JoinCard() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!normalizeJoinCode(code)) {
      setError('Join codes are 6 letters and digits, e.g. KQ7XMA')
      return
    }
    setBusy(true)
    const r = await callAction<{ sessionId: string }>('joinSession', { joinCode: code })
    setBusy(false)
    if (r.ok) navigate(`/sessions/${r.data.sessionId}`)
    else setError(r.error)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] border-t-4 border-t-primary" aria-labelledby="join-title">
      <h2 id="join-title" className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
        <DoorOpen aria-hidden className="size-5 text-primary" /> Join a session
      </h2>
      <p className="text-sm text-muted-foreground">Student? Enter the code on your tutor’s screen.</p>
      <Label htmlFor="join-code" className="sr-only">Join code</Label>
      <Input
        id="join-code"
        data-testid="join-code-input"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Code from your tutor"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={8}
        className="h-12 text-center font-mono text-xl tracking-[0.35em] placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
      />
      {error && <p role="alert" className="text-sm text-destructive" data-testid="join-error">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="join-submit">
        {busy ? 'Joining…' : 'Join'}
      </Button>
    </form>
  )
}

function NewSessionCard() {
  const navigate = useNavigate()
  const { ready, createConfirmed } = useMutations<Pick<SessionData, 'title'>>('sessions')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return setError('Give the session a title')
    try {
      const id = await createConfirmed({ title: t })
      navigate(`/sessions/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the session')
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] border-t-4 border-t-highlight" aria-labelledby="new-title">
      <h2 id="new-title" className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
        <PenLine aria-hidden className="size-5 text-primary" /> Run a session
      </h2>
      <p className="text-sm text-muted-foreground">Tutor? Start a session and add your problems.</p>
      <Label htmlFor="session-title" className="sr-only">Session title</Label>
      <Input
        id="session-title"
        data-testid="new-session-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Calc I: Chain Rule Review"
        maxLength={120}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="outline" className="w-full" disabled={!ready} data-testid="new-session-submit">
        New session
      </Button>
    </form>
  )
}

const STATUS_LABEL: Record<SessionData['status'], string> = { draft: 'Draft', open: 'Live', closed: 'Ended' }
const SHOW_FIRST = 8

function SessionLists() {
  const { userId } = useAuth()
  const { records, status } = useQuery<SessionData>('sessions', { orderBy: 'createdAt', orderDir: 'desc' })
  if (status === 'loading') return <p className="text-sm text-muted-foreground">Loading your sessions…</p>
  if (status === 'error') return <p role="alert" className="text-sm text-destructive">Could not load your sessions.</p>

  const mine = records.filter((r) => r.createdBy === userId)
  const teaching = mine.filter((r) => r.data.archived !== 1)
  const archived = mine.filter((r) => r.data.archived === 1)
  const joined = records.filter((r) => r.createdBy !== userId)

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section aria-label="Sessions you run" className="min-w-0 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">Sessions you run</h2>
          {mine.length > 0 && (
            <Link to="/history" className="text-sm font-medium text-primary hover:underline" data-testid="history-link">
              Students over time →
            </Link>
          )}
        </div>
        <SessionList rows={teaching} empty={archived.length ? 'Nothing here: everything is archived.' : 'None yet. Create one above.'} testId="sessions-run" />
        {archived.length > 0 && (
          <details className="group" data-testid="archived-sessions">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Archived ({archived.length})
            </summary>
            <div className="mt-3">
              <SessionList rows={archived} empty="" testId="sessions-archived" />
            </div>
          </details>
        )}
      </section>
      <section aria-label="Sessions you joined" className="min-w-0 space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Sessions you joined</h2>
        <SessionList rows={joined} empty="None yet. Enter a code above." testId="sessions-joined" />
      </section>
    </div>
  )
}

function SessionList({ rows, empty, testId }: { rows: Envelope<SessionData>[]; empty: string; testId: string }) {
  const [all, setAll] = useState(false)
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  // Live sessions first, then newest first.
  const sorted = [...rows].sort((a, b) => Number(b.data.status === 'open') - Number(a.data.status === 'open'))
  const shown = all ? sorted : sorted.slice(0, SHOW_FIRST)
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)]" data-testid={testId}>
        {shown.map((s) => (
          <li key={s.recordId}>
            <Link
              to={`/sessions/${s.recordId}`}
              className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-secondary"
              data-testid="session-row"
            >
              <span className="min-w-0">
                <span className="line-clamp-2 break-words text-foreground" title={s.data.title}>{s.data.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground" data-testid="session-date">{shortDate(s.createdAt)}</span>
              </span>
              <Badge className="mt-0.5 shrink-0" variant={s.data.status === 'open' ? 'success' : 'outline'}>{STATUS_LABEL[s.data.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > SHOW_FIRST && (
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setAll((v) => !v)} data-testid="show-all-sessions">
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}
