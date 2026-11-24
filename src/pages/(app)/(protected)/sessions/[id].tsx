/**
 * /sessions/:id — one page, two roles. The session's creator gets the tutor
 * setup/board; a joined student gets the answer screen. Anyone else receives
 * no session row from the data layer and sees "not found".
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import { Badge } from '@/components/ui'
import { StudentView } from '../../../../components/session/StudentView'
import { TutorView } from '../../../../components/session/TutorView'
import { RenameSession, SessionTitle } from '../../../../components/session/ManageSession'
import { useSessionRecord } from '../../../../hooks/useSessionData'

/** How long a session may take to appear before we resubscribe once, then before we say so. */
const RETRY_AFTER_MS = 4000
const GIVE_UP_AFTER_MS = 10000

/**
 * The session's subscription is remounted once if the row hasn't arrived after
 * a few seconds (a rare case seen right after joining, where the page sat on
 * "Loading session…"). Remounting sends a fresh subscribe.
 */
export default function SessionPage() {
  const { id } = useParams()
  const [attempt, setAttempt] = useState(0)
  const [waitedMs, setWaitedMs] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  // A different session: start over. Done while rendering (not in an effect) so the
  // new page never paints with the old one's "loaded" state, which skipped the
  // grace period and flashed "Session not found" (e.g. right after Duplicate).
  const [forId, setForId] = useState(id)
  if (forId !== id) {
    setForId(id)
    setAttempt(0)
    setWaitedMs(0)
    setLoaded(false)
    setStartedAt(Date.now())
  }
  // Tick only until the session is in, so a loaded page isn't re-rendered every second.
  useEffect(() => {
    if (loaded) return
    const t = setInterval(() => setWaitedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(t)
  }, [startedAt, loaded])
  const onLoaded = useCallback(() => setLoaded(true), [])
  // Only ever remount while nothing has loaded: remounting a loaded page would throw away unsaved work.
  useEffect(() => {
    if (!loaded && attempt === 0 && waitedMs >= RETRY_AFTER_MS) setAttempt(1)
  }, [loaded, attempt, waitedMs])
  return <SessionContent key={`${id}:${attempt}`} id={id} waitedMs={loaded ? GIVE_UP_AFTER_MS : waitedMs} onLoaded={onLoaded} />
}

function SessionContent({ id, waitedMs, onLoaded }: { id: string | undefined; waitedMs: number; onLoaded: () => void }) {
  const { userId } = useAuth()
  const { session, status } = useSessionRecord(id)
  const found = !!session
  useEffect(() => {
    if (found) onLoaded()
  }, [found])
  // Right after joining, give the row a moment to arrive before saying it doesn't exist.
  const stillArriving = !session && waitedMs < GIVE_UP_AFTER_MS

  if (status === 'loading' && waitedMs >= GIVE_UP_AFTER_MS) return <StillConnecting />
  if (status === 'loading' || (status === 'ready' && stillArriving)) {
    return <p className="p-6 text-muted-foreground" data-testid="session-loading">Loading session…</p>
  }
  if (status === 'error') {
    return (
      <div role="alert" className="mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-medium text-foreground">Can’t reach the session right now</p>
        <p className="mt-1 text-sm text-muted-foreground">Check your connection. This page reconnects by itself.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 text-sm underline">Reload</button>
      </div>
    )
  }
  if (!session) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-medium text-foreground">Session not found</p>
        <p className="mt-1 text-sm text-muted-foreground">Join with the code your tutor shows, or check the link.</p>
        <Link to="/home" className="mt-4 inline-block text-sm underline">Back to home</Link>
      </div>
    )
  }

  const isTutor = session.createdBy === userId
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        {isTutor ? <RenameSession session={session} /> : <SessionTitle title={session.data.title} />}
        <Badge variant={session.data.status === 'open' ? 'success' : 'outline'}>
          {session.data.status === 'open' ? 'Live' : session.data.status === 'draft' ? 'Draft' : 'Ended'}
        </Badge>
        {isTutor && <Badge variant="secondary">You’re the tutor</Badge>}
      </header>
      {isTutor ? <TutorView session={session} /> : <StudentView session={session} />}
    </div>
  )
}

function StillConnecting() {
  return (
    <div role="alert" className="mx-auto max-w-md p-10 text-center" data-testid="session-stuck">
      <p className="text-lg font-medium text-foreground">Still connecting…</p>
      <p className="mt-1 text-sm text-muted-foreground">The session is taking longer than usual to load. Reloading usually fixes it.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 text-sm underline">Reload</button>
    </div>
  )
}
