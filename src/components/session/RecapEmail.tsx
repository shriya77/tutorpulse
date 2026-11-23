/**
 * Recap emails, opt-in per session.
 * - `RecapOptIn` (student): "Email me a recap of this session". Off by default.
 * - `RecapSender` (tutor, after the session ends): how many asked, and a
 *   button that emails each of them their own results once.
 * Both read `recapRequests`, which RBAC limits to the student's own row and
 * the session's tutor. Nobody's email address reaches the browser.
 */

import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Button } from '@/components/ui'
import type { RecapRequestData } from '../../actions/types'
import { callAction } from '../../lib/callAction'

export function RecapOptIn({ sessionId }: { sessionId: string }) {
  const { records, status } = useQuery<RecapRequestData>('recapRequests', { where: { sessionId } })
  const mine = records[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Shown straight away while the server saves it; dropped on failure. */
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  if (status === 'loading') return null

  if (mine?.data.sentAt) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="recap-sent">
        {mine.data.delivery === 'test_account' ? 'Your recap was prepared (test account, so no email was sent).' : 'Your recap has been emailed to you.'}
      </p>
    )
  }
  const checked = optimistic ?? mine?.data.wantsEmail === 1

  async function toggle(next: boolean) {
    setOptimistic(next)
    setBusy(true)
    setError(null)
    const r = await callAction('setRecapEmail', { sessionId, wantsEmail: next })
    setBusy(false)
    if (!r.ok) {
      setOptimistic(null)
      setError(r.error)
    }
  }

  return (
    <div className="text-left">
      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-primary"
          checked={checked}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          data-testid="recap-opt-in"
        />
        <span>
          Email me a recap of this session
          <span className="block text-xs text-muted-foreground">Only your own results, sent once when your tutor wraps up.</span>
        </span>
      </label>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function RecapSender({ sessionId }: { sessionId: string }) {
  const { records } = useQuery<RecapRequestData>('recapRequests', { where: { sessionId } })
  const asked = records.filter((r) => r.data.wantsEmail === 1 || r.data.sentAt)
  const waiting = asked.filter((r) => !r.data.sentAt).length
  const done = asked.length - waiting
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    setNote(null)
    const r = await callAction<{ sent: number; testAccounts: number; failed: number }>('sendRecaps', { sessionId })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const { sent, testAccounts, failed } = r.data
    setNote(
      [sent && `${sent} emailed`, testAccounts && `${testAccounts} test account${testAccounts === 1 ? '' : 's'} skipped`, failed && `${failed} couldn't be sent`]
        .filter(Boolean)
        .join(', ') || 'Nothing to send',
    )
  }

  return (
    <section aria-label="Recap emails" className="space-y-2 rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] p-5" data-testid="recap-panel">
      <h2 className="font-medium text-foreground">Recap emails</h2>
      <p className="text-sm text-muted-foreground" data-testid="recap-count">
        {asked.length === 0
          ? 'No students asked for a recap email.'
          : `${asked.length} student${asked.length === 1 ? '' : 's'} asked for a recap${done ? `, ${done} sent` : ''}.`}{' '}
        Each gets only their own results and the name of their mistake group, never the answer key. Share the practice set first so the email can point to it.
      </p>
      {waiting > 0 && (
        <Button onClick={send} disabled={busy} data-testid="send-recaps">
          {busy ? 'Sending…' : `Email ${waiting} recap${waiting === 1 ? '' : 's'}`}
        </Button>
      )}
      {note && <p className="text-sm text-foreground" aria-live="polite" data-testid="recap-result">{note}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
