/**
 * Student screen (F5, F6): the problem the tutor is showing, rendered with
 * KaTeX; an answer + one-line explanation; "Submitted ✓" with revisions until
 * the tutor locks the problem. The student never sees whether they were
 * right, other students' work, or the answer key — and the data layer
 * enforces that, not this component (see tests/privacy.spec.ts).
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth, usePresenceRoom, useQuery, useR2Files } from 'deepspace'
import { Button, Input, Label } from '@/components/ui'
import type { Envelope, FollowUpData, SessionData, SubmissionData } from '../../actions/types'
import { useFollowUps, useSessionProblems } from '../../hooks/useSessionData'
import { callAction } from '../../lib/callAction'
import { workPhotoRelativeKey, workRelativeKey } from '../../lib/work'
import { MAX_WORK_BYTES } from '../../lib/limits'
import { useWorkImage } from '../../hooks/useWorkImage'
import { MathText } from '../MathText'
import { HintPanel } from './HintPanel'
import { PracticeSetLink } from './PracticeSetLink'
import { RecapOptIn } from './RecapEmail'
import { WorkPad, type WorkPadHandle } from './WorkPad'

/** What a student shares with the tutor's live roster (F10). Ephemeral, never stored. */
export interface StudentPresence {
  problemId: string | null
  submitted: boolean
  stuck: boolean
}

export function StudentView({ session }: { session: Envelope<SessionData> }) {
  const { problems, followUpProblems, status } = useSessionProblems(session.recordId, session.createdBy)
  // RBAC returns only this student's own submissions.
  const { records: mySubmissions } = useQuery<SubmissionData>('submissions', { where: { sessionId: session.recordId } })
  // RBAC returns only follow-ups sent to THIS student.
  const { records: myFollowUps } = useFollowUps(session.recordId)
  const followUp = followUpProblems.find(
    (p) => p.data.status !== 'locked' && (myFollowUps as Envelope<FollowUpData>[]).some((f) => f.data.problemId === p.recordId),
  )
  const followUpMine = followUp ? mySubmissions.find((s) => s.data.problemId === followUp.recordId) : undefined
  const [stuck, setStuck] = useState(false)
  const { connected, updateState } = usePresenceRoom(`session:${session.recordId}`)
  const { userId } = useAuth()

  const index = problems.findIndex((p) => p.recordId === session.data.currentProblemId)
  const problem = problems[index]
  const mine = problem ? mySubmissions.find((s) => s.data.problemId === problem.recordId) : undefined
  const presence: StudentPresence = { problemId: problem?.recordId ?? null, submitted: !!mine, stuck }

  // Re-send whenever it changes AND after every reconnect (a reconnect clears our state).
  useEffect(() => {
    if (connected) updateState({ ...presence })
  }, [connected, presence.problemId, presence.submitted, presence.stuck])

  // A new problem starts un-stuck.
  useEffect(() => setStuck(false), [problem?.recordId])

  if (session.data.status === 'closed') {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] p-6 text-center">
        <p className="text-lg font-medium text-foreground">This session has ended.</p>
        <p className="mt-1 text-sm text-muted-foreground">Thanks for taking part.</p>
        <PracticeSetLink sessionId={session.recordId} />
        <div className="mx-auto mt-5 w-fit max-w-full">
          <RecapOptIn sessionId={session.recordId} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {session.data.focusLabel && (
        <div role="status" className="rounded-2xl border-2 border-highlight bg-accent px-5 py-4 text-foreground" data-testid="focus-banner">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Discussing </span>
          <span className="hl font-display text-xl font-semibold">{session.data.focusLabel}</span>
        </div>
      )}
      {followUp && (
        <AnswerCard
          key={followUp.recordId}
          problemId={followUp.recordId}
          number={0}
          heading="Quick check from your tutor"
          prompt={followUp.data.prompt}
          locked={false}
          mine={followUpMine}
          onSubmitted={() => setStuck(false)}
        />
      )}
      {status === 'loading' ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !problem ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          Waiting for your tutor to show a problem…
        </div>
      ) : (
        <>
          <AnswerCard
            key={problem.recordId}
            problemId={problem.recordId}
            number={index + 1}
            prompt={problem.data.prompt}
            locked={problem.data.status === 'locked'}
            mine={mine}
            onSubmitted={() => setStuck(false)}
          />
          <Button
            type="button"
            variant={stuck ? 'secondary' : 'outline'}
            aria-pressed={stuck}
            onClick={() => setStuck((v) => !v)}
            data-testid="stuck-button"
          >
            {stuck ? 'Tutor notified. Tap again when you’re unstuck' : 'I’m stuck'}
          </Button>
          {userId && <HintPanel userId={userId} />}
        </>
      )}
      <RecapOptIn sessionId={session.recordId} />
    </div>
  )
}

function AnswerCard({
  problemId, number, heading, prompt, locked, mine, onSubmitted,
}: {
  problemId: string
  number: number
  /** Replaces "Problem N" (used for a follow-up check). */
  heading?: string
  prompt: string
  locked: boolean
  mine?: Envelope<SubmissionData>
  onSubmitted: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [padDirty, setPadDirty] = useState(false)
  const [padInk, setPadInk] = useState(false)
  const [typedExplanation, setTypedExplanation] = useState(false) // keeps the box from vanishing mid-edit
  const pad = useRef<WorkPadHandle>(null)
  const { upload } = useR2Files() // private 'self' folder: only this student (and the checked route) can read it
  // The saved working, so a revision continues from it. Fetched once per submission row.
  const { url: savedWorkUrl, type: savedWorkType } = useWorkImage(mine?.recordId, !!mine?.data.workKey)
  const savedIsPhoto = savedWorkType === 'image/jpeg'
  // A photo of paper working, as an alternative to the pad.
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [photoDirty, setPhotoDirty] = useState(false)
  const [usePad, setUsePad] = useState(true)
  const [photoError, setPhotoError] = useState<string | null>(null)
  useEffect(() => {
    if (savedIsPhoto && !photoDirty) setUsePad(false)
  }, [savedIsPhoto])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  const photoUrl = photo?.url ?? (savedIsPhoto && !photoDirty ? savedWorkUrl : null)

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return
    setPhotoError(null)
    try {
      const blob = await shrinkPhoto(file)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
      setPhotoDirty(true)
      setUsePad(false)
    } catch {
      setPhotoError('Could not read that photo, try another')
    }
  }
  function removePhoto() {
    setPhoto(null)
    setPhotoDirty(true)
    setUsePad(true)
  }

  // Prefill with the saved answer once it arrives, so revising starts from it.
  useEffect(() => {
    if (mine && !answer && !explanation) {
      setAnswer(mine.data.answer)
      setExplanation(mine.data.explanation ?? '')
    }
  }, [mine?.recordId])

  // With written working the one-line explanation is redundant (the tutor and the
  // grouping read the working), so it only shows when the pad is empty, or when it
  // already holds text that would still be sent.
  const hasWorking = usePad ? padInk || (!padDirty && !photoDirty && !!mine?.data.workKey && !savedIsPhoto) : !!photoUrl
  const showExplanation = !hasWorking || explanation.trim() !== '' || typedExplanation

  const unchanged =
    mine && !padDirty && !photoDirty && mine.data.answer === answer.trim() && (mine.data.explanation ?? '') === explanation.trim()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Untouched pad: keep the working already saved. Otherwise upload the new drawing
      // (same key per problem, so it replaces the old one), or none if it was cleared.
      let workKey = mine?.data.workKey ?? ''
      if (!usePad && photo) {
        const up = await upload(photo.blob, 'working.jpg', { key: workPhotoRelativeKey(problemId) })
        if (!up.success || !up.key) throw new Error(up.error || 'Could not save your photo')
        workKey = up.key
      } else if (usePad && (pad.current?.dirty || photoDirty)) {
        const png = (await pad.current?.exportPng()) ?? null
        workKey = ''
        if (png) {
          const up = await upload(png, 'working.png', { key: workRelativeKey(problemId) })
          if (!up.success || !up.key) throw new Error(up.error || 'Could not save your working')
          workKey = up.key
        }
      }
      const r = await callAction<{ revision: number }>('submitAnswer', { problemId, answer, explanation, workKey })
      if (!r.ok) throw new Error(r.error)
      pad.current?.markSaved()
      setPhotoDirty(false)
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] p-5" aria-labelledby={`problem-heading-${problemId}`} data-testid={heading ? 'follow-up-card' : 'answer-card'}>
      <h2 id={`problem-heading-${problemId}`} className={`text-sm font-medium ${heading ? 'text-primary' : 'text-muted-foreground'}`}>{heading ?? `Problem ${number}`}</h2>
      {/* Long expressions scroll sideways on phones; the edge fade hints that there is more. */}
      <div
        className="overflow-x-auto text-lg text-foreground sm:text-2xl [mask-image:linear-gradient(to_right,black_92%,transparent)] sm:[mask-image:none]"
        data-testid="student-problem"
        tabIndex={0}
        aria-label={heading ?? `Problem ${number}`}
      >
        <MathText source={prompt} display />
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">Show your working</span>
        <p className="-mt-1 text-xs text-muted-foreground">
          Write your steps here, or take a photo of your paper. Only your tutor sees them, and it helps them spot where things went off track.
        </p>
        {usePad ? (
          <WorkPad ref={pad} baseUrl={savedIsPhoto ? null : savedWorkUrl} disabled={locked || busy} onDirtyChange={setPadDirty} onInkChange={setPadInk} />
        ) : (
          photoUrl && (
            <div className="overflow-hidden rounded-xl border border-input bg-white">
              <img src={photoUrl} alt="Photo of your working" className="mx-auto max-h-96 w-auto" data-testid="work-photo" />
            </div>
          )
        )}
        <div className="flex flex-wrap items-center gap-2">
          {usePad ? (
            // `relative` keeps the visually hidden input inside this label. Without it the
            // input is positioned against <body>, far below the screen, and opening the
            // file chooser scrolled the page to it, leaving a blank strip on laptops.
            <label className={`relative inline-flex cursor-pointer items-center rounded-lg border border-input px-3 py-1.5 text-sm text-foreground hover:bg-secondary ${locked || busy ? 'pointer-events-none opacity-50' : ''}`}>
              Use a photo of paper instead
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={locked || busy}
                onChange={(e) => {
                  void onPhotoPicked(e.target.files?.[0])
                  e.target.value = ''
                }}
                data-testid="work-photo-input"
              />
            </label>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={removePhoto} disabled={locked || busy} data-testid="work-photo-remove">
              Remove photo and use the pad
            </Button>
          )}
          {photoError && <span role="alert" className="text-sm text-destructive">{photoError}</span>}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`answer-${problemId}`}>Your final answer</Label>
        <Input
          id={`answer-${problemId}`}
          data-testid="answer-input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="e.g. 3x^2 + 2"
          disabled={locked}
          maxLength={200}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="font-mono"
        />
      </div>
      {showExplanation && (
        <div className="grid gap-1.5">
          <Label htmlFor={`explanation-${problemId}`}>
            How did you get it? <span className="font-normal text-muted-foreground">(optional, one line)</span>
          </Label>
          <Input
            id={`explanation-${problemId}`}
            data-testid="explanation-input"
            value={explanation}
            onChange={(e) => {
              setExplanation(e.target.value)
              setTypedExplanation(true)
            }}
            placeholder="e.g. used the power rule on each term"
            disabled={locked}
            maxLength={280}
          />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={locked || busy || !answer.trim() || !!unchanged} data-testid="submit-answer">
          {busy ? 'Saving…' : mine ? 'Update answer' : 'Submit'}
        </Button>
        <span aria-live="polite" className={`text-sm font-medium ${mine && !locked ? 'text-success' : 'text-muted-foreground'}`} data-testid="submit-status">
          {locked
            ? 'Answers are locked for this problem.'
            : mine
              ? `Submitted ✓${mine.data.revision > 1 ? ` (revision ${mine.data.revision})` : ''}`
              : ''}
        </span>
      </div>
    </form>
  )
}

/**
 * Shrink a phone photo and re-encode it as JPEG on the student's own device.
 * Re-encoding drops the EXIF block (camera details and GPS location), and the
 * server refuses any JPEG that still has one (src/lib/work.ts).
 */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_WORK_BYTES) return blob
  }
  throw new Error('Photo too large')
}
