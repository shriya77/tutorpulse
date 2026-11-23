/**
 * Tutor's session housekeeping, at the bottom of a draft or ended session:
 * - Duplicate: a new draft with the same problems and keys (`duplicateSession`).
 * - Archive / Unarchive: tuck it away on the home page (the tutor's own list only).
 * - Delete: permanently, for everyone (`deleteSession`). A live session must be ended first.
 * Plus `RenameSession`, the title editor in the page header (any status).
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutations } from 'deepspace'
import { Archive, ArchiveRestore, Copy, Pencil } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import type { Envelope, SessionData } from '../../actions/types'
import { callAction } from '../../lib/callAction'

const MAX_TITLE = 120

export function ManageSession({ session }: { session: Envelope<SessionData> }) {
  const navigate = useNavigate()
  const sessions = useMutations<Pick<SessionData, 'archived'>>('sessions')
  const [busy, setBusy] = useState<null | 'copy' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const students = Array.isArray(session.data.participantIds) ? session.data.participantIds.length : 0
  const archived = session.data.archived === 1

  async function duplicate() {
    setBusy('copy')
    setError(null)
    const r = await callAction<{ sessionId: string }>('duplicateSession', { sessionId: session.recordId })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    navigate(`/sessions/${r.data.sessionId}`)
  }

  async function remove() {
    const what = students
      ? `its problems, all ${students} student${students === 1 ? '' : 's'}' answers and working, the mistake groups, practice sets and notes`
      : 'its problems, practice sets and notes'
    if (!window.confirm(`Delete “${session.data.title}”? This removes ${what}, for everyone. It can't be undone.`)) return
    setBusy('delete')
    setError(null)
    const r = await callAction('deleteSession', { sessionId: session.recordId })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    navigate('/home', { replace: true })
  }

  return (
    <section aria-label="Manage session" className="space-y-3 border-t border-border pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={duplicate} disabled={busy !== null} data-testid="duplicate-session">
          <Copy aria-hidden className="size-4" /> {busy === 'copy' ? 'Copying…' : 'Duplicate'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!sessions.ready || busy !== null}
          onClick={() => sessions.put(session.recordId, { archived: archived ? 0 : 1 })}
          aria-pressed={archived}
          data-testid="archive-session"
        >
          {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
          {archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 sm:ml-auto"
          onClick={remove}
          disabled={busy !== null}
          data-testid="delete-session"
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete session'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">Duplicate</strong> starts a new draft with the same problems and answer keys, for another group.{' '}
        <strong className="font-medium text-foreground">Archive</strong> tucks it away on your home page; students aren't affected.{' '}
        <strong className="font-medium text-foreground">Delete</strong> removes it for you and your students{students ? ', including their answers and working' : ''}.
      </p>
      {archived && <p className="text-sm text-muted-foreground" data-testid="archived-note">Archived. It’s under “Archived” on your home page.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}

export function SessionTitle({ title }: { title: string }) {
  return <h1 className="min-w-0 break-words font-display text-3xl font-semibold tracking-tight text-foreground" data-testid="session-title">{title}</h1>
}

/** The session title, with a Rename button for its tutor. Students see the change live. */
export function RenameSession({ session }: { session: Envelope<SessionData> }) {
  const sessions = useMutations<Pick<SessionData, 'title'>>('sessions')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(session.data.title)
  const [error, setError] = useState<string | null>(null)

  function save(e: FormEvent) {
    e.preventDefault()
    const t = title.replace(/\s+/g, ' ').trim()
    if (!t) return setError('Give the session a title')
    if (t !== session.data.title) sessions.put(session.recordId, { title: t.slice(0, MAX_TITLE) })
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <>
        <SessionTitle title={session.data.title} />
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            setTitle(session.data.title)
            setEditing(true)
          }}
          aria-label="Rename session"
          data-testid="rename-session"
        >
          <Pencil aria-hidden className="size-4" /> <span className="hidden sm:inline">Rename</span>
        </Button>
      </>
    )
  }
  return (
    <form onSubmit={save} className="flex w-full flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        maxLength={MAX_TITLE}
        aria-label="Session title"
        className="min-w-0 flex-1 text-base"
        data-testid="rename-input"
      />
      <Button type="submit" size="sm" disabled={!sessions.ready} data-testid="rename-save">Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </form>
  )
}
