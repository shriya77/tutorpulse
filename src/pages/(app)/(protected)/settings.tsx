/**
 * Settings. Reached at /settings; (protected)/_layout.tsx already wraps the
 * subtree in <AuthGate>.
 *
 * Display name: TutorPulse keeps its own name for you (see
 * src/schemas/display-names-schema.ts), so changing it here never renames
 * your sign-in account.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { signOut, useUser } from 'deepspace'
import { Button, Input, Label } from '@/components/ui'
import { useMyDisplayName } from '../../../hooks/useDisplayName'
import { callAction } from '../../../lib/callAction'
import { MAX_DISPLAY_NAME } from '../../../lib/displayName'

export default function SettingsPage() {
  const { user } = useUser()
  const current = useMyDisplayName()
  const [draft, setDraft] = useState(current)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  // Follow the saved value until the user starts typing.
  useEffect(() => setDraft(current), [current])

  async function save(name: string) {
    setBusy(true)
    setStatus(null)
    const r = await callAction<{ name: string }>('setDisplayName', { name })
    setBusy(false)
    if (!r.ok) return setStatus({ kind: 'error', text: r.error })
    setDraft(r.data.name)
    setStatus({ kind: 'ok', text: r.data.name ? 'Saved. Your tutor and the app now use this name.' : 'Back to your account name.' })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void save(draft)
  }

  const shown = current || user?.name || ''
  const unchanged = draft.trim() === current

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
        <h1 className="mb-10 text-4xl font-bold tracking-tight">Settings</h1>

        <section className="space-y-6 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Your account</h2>

          <form onSubmit={onSubmit} className="space-y-2" data-testid="display-name-form">
            <Label htmlFor="display-name">Display name</Label>
            <p className="text-xs text-muted-foreground">
              What your tutor sees on the roster and in history, and what recap emails call you. It only changes your name in TutorPulse, not your sign-in account.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="display-name"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setStatus(null)
                }}
                placeholder={user?.name || 'Your name'}
                maxLength={MAX_DISPLAY_NAME + 10}
                autoComplete="nickname"
                className="sm:flex-1"
                data-testid="display-name-input"
              />
              <Button type="submit" disabled={busy || unchanged} data-testid="display-name-save">
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {current && (
              <Button type="button" variant="link" className="h-auto px-0 text-xs" onClick={() => save('')} disabled={busy} data-testid="display-name-reset">
                Use my account name{user?.name ? ` (${user.name})` : ''} instead
              </Button>
            )}
            {status && (
              <p role={status.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${status.kind === 'error' ? 'text-destructive' : 'text-success'}`} data-testid="display-name-status">
                {status.text}
              </p>
            )}
          </form>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Shown as</dt>
              <dd className="text-foreground" data-testid="display-name-shown">{shown || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? 'Not set'}</dd>
            </div>
          </dl>

          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>
      </div>
    </div>
  )
}
