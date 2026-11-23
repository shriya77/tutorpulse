/**
 * Settings. Reached at /settings; (protected)/_layout.tsx already wraps the
 * subtree in <AuthGate>.
 *
 * Display name: TutorPulse keeps its own name for you (see
 * src/schemas/display-names-schema.ts), so changing it here never renames
 * your sign-in account.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { signOut, useQuery, useUser } from 'deepspace'
import { Button, Input, Label } from '@/components/ui'
import { useMyDisplayName } from '../../../hooks/useDisplayName'
import { callAction } from '../../../lib/callAction'
import { MAX_DISPLAY_NAME } from '../../../lib/displayName'
import { getColorMode, setColorMode, type ColorMode } from '../../../lib/colorMode'

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

        <WeeklyDigest />
        <Appearance />
      </div>
    </div>
  )
}

const MODES: Array<{ value: ColorMode; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Match this device' },
  { value: 'light', label: 'Light', hint: 'Paper' },
  { value: 'dark', label: 'Dark', hint: 'Notebook at night' },
]

/** Light / dark mode, saved on this device. The sketch pad stays light paper either way. */
function Appearance() {
  const [mode, setMode] = useState<ColorMode>(() => getColorMode())
  return (
    <section className="mt-6 space-y-3 rounded-lg border border-border bg-card p-6" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="text-lg font-semibold">Appearance</h2>
      <div role="radiogroup" aria-labelledby="appearance-title" className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`relative flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${mode === m.value ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-secondary'}`}
          >
            <input
              type="radio"
              name="color-mode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => {
                setMode(m.value)
                setColorMode(m.value)
              }}
              className="sr-only"
              data-testid={`color-mode-${m.value}`}
            />
            <span className="font-medium text-foreground">{m.label}</span>
            <span className="text-xs text-muted-foreground">{m.hint}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Saved on this device. The sketch pad stays light paper either way, so your working looks the same to your tutor.</p>
    </section>
  )
}

const OUTCOME_TEXT: Record<string, string> = {
  sent: 'Sent. Check your inbox (and spam, the first time).',
  test_account: 'Built, but not sent: this is a test account.',
  empty: 'Nothing to send: you haven’t run a session in the past 7 days.',
  no_email: 'Your account has no email address to send to.',
  failed: 'The email couldn’t be sent. Try again later.',
}

/** Tutor's weekly summary email: off unless turned on here. */
function WeeklyDigest() {
  const { records, status } = useQuery<{ weekly: number; lastSentAt?: string }>('digestPrefs')
  const saved = records[0]?.data.weekly === 1
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<null | 'toggle' | 'preview'>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const on = optimistic ?? saved

  async function toggle(next: boolean) {
    setOptimistic(next)
    setBusy('toggle')
    setNote(null)
    const r = await callAction('setWeeklyDigest', { weekly: next })
    setBusy(null)
    if (!r.ok) {
      setOptimistic(null)
      setNote({ kind: 'error', text: r.error })
    }
  }
  async function preview() {
    setBusy('preview')
    setNote(null)
    const r = await callAction<{ outcome: string }>('sendDigestPreview', {})
    setBusy(null)
    setNote(r.ok ? { kind: r.data.outcome === 'sent' ? 'ok' : 'error', text: OUTCOME_TEXT[r.data.outcome] ?? r.data.outcome } : { kind: 'error', text: r.error })
  }

  return (
    <section className="mt-6 space-y-3 rounded-lg border border-border bg-card p-6" aria-labelledby="digest-title">
      <h2 id="digest-title" className="text-lg font-semibold">Weekly summary email</h2>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-primary"
          checked={on}
          disabled={status === 'loading' || busy !== null}
          onChange={(e) => toggle(e.target.checked)}
          data-testid="digest-toggle"
        />
        <span>
          Email me a summary of my sessions every Monday morning
          <span className="block text-xs text-muted-foreground">
            For tutors: the week’s sessions, the most common misconceptions, and students whose mistake came back. It names your students, so it only goes to you. Nothing is sent in a week with no sessions.
          </span>
        </span>
      </label>
      {records[0]?.data.lastSentAt && (
        <p className="text-xs text-muted-foreground" data-testid="digest-last">Last sent {new Date(records[0].data.lastSentAt).toLocaleDateString()}.</p>
      )}
      <Button variant="outline" size="sm" onClick={preview} disabled={busy !== null} data-testid="digest-preview">
        {busy === 'preview' ? 'Sending…' : 'Email me a preview now'}
      </Button>
      {note && (
        <p role={note.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${note.kind === 'ok' ? 'text-success' : 'text-muted-foreground'}`} data-testid="digest-note">
          {note.text}
        </p>
      )}
    </section>
  )
}
