/**
 * Live roster for the tutor (F10). Joined students come from
 * `session.participantIds`; who is online, which problem they're on, whether
 * they've submitted and whether they pressed "I'm stuck" come from the
 * session's presence room (ephemeral — nothing here is stored).
 * Status is spelled out in text, not colour alone.
 */

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { callAction } from '../../lib/callAction'
import { usePresenceRoom, useUserLookup } from 'deepspace'
import type { Envelope, ProblemData, SessionData } from '../../actions/types'
import type { StudentPresence } from './StudentView'
import { useSessionDisplayNames } from '../../hooks/useDisplayName'

export function TutorRoster({ session, problems }: { session: Envelope<SessionData>; problems: Envelope<ProblemData>[] }) {
  const { peers, connected } = usePresenceRoom(`session:${session.recordId}`)
  const { getName } = useUserLookup()
  const displayNames = useSessionDisplayNames(session.recordId, Array.isArray(session.data.participantIds) ? session.data.participantIds : [])
  const problemNumber = useMemo(() => new Map(problems.map((p, i) => [p.recordId, i + 1])), [problems])

  const rows = useMemo(() => {
    const online = new Map(peers.map((p) => [p.userId, p]))
    const ids = Array.isArray(session.data.participantIds) ? session.data.participantIds : []
    return ids
      .map((id) => {
        const peer = online.get(id)
        const state = (peer?.state ?? {}) as Partial<StudentPresence>
        return {
          id,
          name: displayNames[id] || peer?.userName || getName(id) || 'Student',
          online: !!peer,
          problem: state.problemId ? problemNumber.get(state.problemId) : undefined,
          submitted: !!state.submitted,
          stuck: !!state.stuck,
        }
      })
      .sort((a, b) => Number(b.stuck) - Number(a.stuck) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
  }, [peers, session.data.participantIds, getName, problemNumber, displayNames])

  const stuckCount = rows.filter((r) => r.stuck).length

  return (
    <section aria-label="Students" className="rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] p-4" data-testid="roster">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Students{rows.length > 0 && <span className="text-muted-foreground"> ({rows.filter((r) => r.online).length} online)</span>}
        </h2>
        {stuckCount > 0 && (
          <span className="rounded-full bg-warning px-2.5 py-0.5 text-sm font-semibold text-warning-foreground" aria-live="polite">{stuckCount} stuck</span>
        )}
        {!connected && <span className="text-xs text-muted-foreground">Reconnecting…</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has joined yet. Share the join code.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2" data-testid="roster-row">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full ${r.online ? 'bg-success' : 'bg-muted-foreground/40'}`}
                />
                <span className={`truncate ${r.online ? 'text-foreground' : 'text-muted-foreground'}`} data-testid="roster-name">{r.name}</span>
                <span className="sr-only">{r.online ? 'online' : 'offline'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                {r.online && r.problem && <span>on P{r.problem}</span>}
                {r.online && r.submitted && <span className="text-foreground" data-testid="roster-submitted">✓ submitted</span>}
                {r.stuck && (
                  <span className="rounded bg-warning px-1.5 py-0.5 text-xs font-medium text-warning-foreground" data-testid="roster-stuck">
                    Stuck
                  </span>
                )}
                {!r.online && <span>offline</span>}
                <RemoveStudent sessionId={session.recordId} studentId={r.id} name={r.name} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Take a student out of the session (and its board). They can't rejoin with the code. */
function RemoveStudent({ sessionId, studentId, name }: { sessionId: string; studentId: string; name: string }) {
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (!window.confirm(`Remove ${name} from this session? Their answers here are deleted and the join code won't let them back in.`)) return
    setBusy(true)
    const r = await callAction('removeStudent', { sessionId, studentId })
    setBusy(false)
    if (!r.ok) window.alert(r.error)
  }
  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      aria-label={`Remove ${name} from the session`}
      title="Remove from session"
      data-testid="roster-remove"
    >
      <X className="size-4" aria-hidden />
    </button>
  )
}
