/**
 * Permanently delete a draft or ended session (the `deleteSession` action).
 * Shown at the bottom of the tutor's page; a live session must be ended first.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import type { Envelope, SessionData } from '../../actions/types'
import { callAction } from '../../lib/callAction'

export function DeleteSession({ session }: { session: Envelope<SessionData> }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const students = Array.isArray(session.data.participantIds) ? session.data.participantIds.length : 0

  async function remove() {
    const what = students
      ? `its problems, all ${students} student${students === 1 ? '' : 's'}' answers and working, the mistake groups, practice sets and notes`
      : 'its problems, practice sets and notes'
    if (!window.confirm(`Delete “${session.data.title}”? This removes ${what}, for everyone. It can't be undone.`)) return
    setBusy(true)
    setError(null)
    const r = await callAction('deleteSession', { sessionId: session.recordId })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    navigate('/home', { replace: true })
  }

  return (
    <section aria-label="Delete session" className="flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Done with this session? Deleting it removes it for you and your students{students ? ', including their answers and working' : ''}.
      </p>
      <Button variant="outline" size="sm" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={remove} disabled={busy} data-testid="delete-session">
        {busy ? 'Deleting…' : 'Delete session'}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
