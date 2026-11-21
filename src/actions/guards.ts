/**
 * Access guards for server actions.
 *
 * Server actions run with RBAC OFF (`X-App-Action: true`): `tools.get` and
 * `tools.query` return any row in the app. So every action must call one of
 * these before reading or writing session data, and must scope every later
 * query to what the guard returned.
 *
 * Who is who:
 *   - the tutor of a session is the session row's creator (`createdBy`);
 *   - a participant is a user listed in `session.participantIds`
 *     (added only by `joinSession`).
 *
 * Failures use one generic message for "missing" and "not allowed" so a
 * caller cannot probe which session ids exist.
 */

import type { ActionContext } from 'deepspace/worker'
import type { Envelope, ProblemData, SessionData, SessionStatus } from './types'

/** The part of the action context a guard needs (keeps guards unit-testable). */
export type GuardContext = Pick<ActionContext, 'userId' | 'tools'>

export type GuardResult<T> = ({ ok: true } & T) | { ok: false; error: string }

export const SESSION_NOT_FOUND = 'Session not found'
export const PROBLEM_NOT_FOUND = 'Problem not found'

async function loadSession(ctx: GuardContext, sessionId: unknown): Promise<Envelope<SessionData> | null> {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  const res = await ctx.tools.get<SessionData>('sessions', sessionId)
  if (!res.success) return null
  return res.data.record as Envelope<SessionData>
}

function statusAllowed(session: Envelope<SessionData>, statuses?: SessionStatus[]): boolean {
  return !statuses || statuses.includes(session.data.status)
}

/** The caller must be the session's tutor (its creator). */
export async function requireTutor(
  ctx: GuardContext,
  sessionId: unknown,
  options: { statuses?: SessionStatus[] } = {},
): Promise<GuardResult<{ session: Envelope<SessionData> }>> {
  const session = await loadSession(ctx, sessionId)
  if (!session || session.createdBy !== ctx.userId) return { ok: false, error: SESSION_NOT_FOUND }
  if (!statusAllowed(session, options.statuses)) {
    return { ok: false, error: `Session is ${session.data.status}` }
  }
  return { ok: true, session }
}

/**
 * The caller must be a joined student of the session. The tutor is not a
 * participant: tutors do not submit answers.
 */
export async function requireParticipant(
  ctx: GuardContext,
  sessionId: unknown,
  options: { statuses?: SessionStatus[] } = {},
): Promise<GuardResult<{ session: Envelope<SessionData> }>> {
  const session = await loadSession(ctx, sessionId)
  const participants = Array.isArray(session?.data.participantIds) ? session.data.participantIds : []
  if (!session || !participants.includes(ctx.userId)) return { ok: false, error: SESSION_NOT_FOUND }
  if (!statusAllowed(session, options.statuses)) {
    return { ok: false, error: `Session is ${session.data.status}` }
  }
  return { ok: true, session }
}

/**
 * Load a problem and prove it belongs to its session: any member can create
 * a `problems` row with any `sessionId`, so a problem only counts if the
 * session's tutor created it. Does NOT check the caller — follow with
 * `requireTutor` / `requireParticipant` on `problem.data.sessionId`.
 */
export async function loadSessionProblem(
  ctx: GuardContext,
  problemId: unknown,
): Promise<GuardResult<{ problem: Envelope<ProblemData> }>> {
  if (typeof problemId !== 'string' || problemId.length === 0) return { ok: false, error: PROBLEM_NOT_FOUND }
  const res = await ctx.tools.get<ProblemData>('problems', problemId)
  if (!res.success) return { ok: false, error: PROBLEM_NOT_FOUND }
  const problem = res.data.record as Envelope<ProblemData>
  const session = await loadSession(ctx, problem.data.sessionId)
  if (!session || session.createdBy !== problem.createdBy) return { ok: false, error: PROBLEM_NOT_FOUND }
  return { ok: true, problem }
}
