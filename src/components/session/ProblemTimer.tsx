/**
 * Optional countdown on the problem being shown. The tutor starts it (1, 2 or
 * 5 minutes) and can stop it; students see the same countdown by their
 * problem. It's a nudge: answers stay open until the tutor locks them.
 * Stored as `timerEndsAt` + `timerProblemId` on the session, so it stops
 * showing as soon as the tutor moves to another problem. Each device counts
 * down with its own clock, so a few seconds' drift is possible.
 */

import { useEffect, useState } from 'react'
import { useMutations } from 'deepspace'
import { Timer } from 'lucide-react'
import { Button } from '@/components/ui'
import type { Envelope, SessionData } from '../../actions/types'

const PRESETS = [1, 2, 5]

/** Seconds left until `endsAt` (0 once it has passed), ticking every second; null without a timer. */
export function useSecondsLeft(endsAt: string | undefined): number | null {
  const end = endsAt ? Date.parse(endsAt) : NaN
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (Number.isNaN(end)) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [end])
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - now) / 1000))
}

export const formatLeft = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** The countdown as a pill, for whoever is looking at this problem. */
export function TimerBadge({ session, problemId }: { session: Envelope<SessionData>; problemId: string }) {
  const active = session.data.timerProblemId === problemId ? session.data.timerEndsAt : undefined
  const left = useSecondsLeft(active)
  if (left === null) return null
  const up = left === 0
  return (
    <span
      role="timer"
      aria-live={up || left <= 10 ? 'assertive' : 'off'}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${up ? 'bg-highlight text-foreground' : left <= 30 ? 'bg-highlight/50 text-foreground' : 'bg-secondary text-foreground'}`}
      data-testid="problem-timer"
    >
      <Timer aria-hidden className="size-3.5" />
      {up ? 'Time’s up' : `${formatLeft(left)} left`}
    </span>
  )
}

/** Tutor's start / stop buttons on the problem being shown. */
export function TimerControls({ session, problemId }: { session: Envelope<SessionData>; problemId: string }) {
  const sessions = useMutations<Partial<SessionData>>('sessions')
  const running = session.data.timerProblemId === problemId && !!session.data.timerEndsAt
  if (running) {
    return (
      <Button size="sm" variant="ghost" disabled={!sessions.ready} onClick={() => sessions.put(session.recordId, { timerEndsAt: '', timerProblemId: '' })} data-testid="timer-stop">
        Stop timer
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Start a timer">
      <Timer aria-hidden className="size-4 text-muted-foreground" />
      {PRESETS.map((m) => (
        <Button
          key={m}
          size="sm"
          variant="ghost"
          className="px-2"
          disabled={!sessions.ready}
          onClick={() => sessions.put(session.recordId, { timerEndsAt: new Date(Date.now() + m * 60_000).toISOString(), timerProblemId: problemId })}
          aria-label={`Start a ${m} minute timer`}
          data-testid={`timer-${m}`}
        >
          {m}m
        </Button>
      ))}
    </span>
  )
}
