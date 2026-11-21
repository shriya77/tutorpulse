/**
 * Home: join a session by code (students) or start / reopen one (tutors).
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth, useMutations, useQuery } from 'deepspace'
import { Badge, Button, Input, Label } from '@/components/ui'
import type { SessionData } from '../../actions/types'
import { callAction } from '../../lib/callAction'
import { normalizeJoinCode } from '../../lib/joinCode'

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
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">TutorPulse</h1>
      <p className="text-muted-foreground">
        Live group tutoring that shows you <em>why</em> answers are wrong, while the session is still running.
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
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-card p-5" aria-labelledby="join-title">
      <h2 id="join-title" className="font-medium text-foreground">Join a session</h2>
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
        className="font-mono text-lg tracking-[0.3em]"
      />
      {error && <p role="alert" className="text-sm text-destructive" data-testid="join-error">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy} data-testid="join-submit">
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
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-card p-5" aria-labelledby="new-title">
      <h2 id="new-title" className="font-medium text-foreground">Run a session</h2>
      <Label htmlFor="session-title" className="sr-only">Session title</Label>
      <Input
        id="session-title"
        data-testid="new-session-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Calc I — Chain Rule Review"
        maxLength={120}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="secondary" className="w-full" disabled={!ready} data-testid="new-session-submit">
        New session
      </Button>
    </form>
  )
}

const STATUS_LABEL: Record<SessionData['status'], string> = { draft: 'Draft', open: 'Live', closed: 'Ended' }

function SessionLists() {
  const { userId } = useAuth()
  const { records, status } = useQuery<SessionData>('sessions', { orderBy: 'updatedAt', orderDir: 'desc' })
  if (status === 'loading') return <p className="text-sm text-muted-foreground">Loading your sessions…</p>
  if (status === 'error') return <p role="alert" className="text-sm text-destructive">Could not load your sessions.</p>

  const teaching = records.filter((r) => r.createdBy === userId)
  const joined = records.filter((r) => r.createdBy !== userId)

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {[
        { title: 'Sessions you run', rows: teaching, empty: 'None yet. Create one above.' },
        { title: 'Sessions you joined', rows: joined, empty: 'None yet. Enter a code above.' },
      ].map((list) => (
        <section key={list.title} aria-label={list.title} className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{list.title}</h2>
          {list.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{list.empty}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {list.rows.map((s) => (
                <li key={s.recordId}>
                  <Link
                    to={`/sessions/${s.recordId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <span className="truncate text-foreground">{s.data.title}</span>
                    <Badge variant={s.data.status === 'open' ? 'success' : 'outline'}>{STATUS_LABEL[s.data.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
