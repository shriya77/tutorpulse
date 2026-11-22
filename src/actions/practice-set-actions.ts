/**
 * Practice sets (F15, F16).
 *
 * - `startPracticeSet` creates the `practiceSets` row (readable only by the
 *   tutor) and enqueues the `practice-set` sandbox job, within the session's
 *   cap. The tutor starts it from the wrap-up panel after ending the session
 *   (`generatePracticeSet`) — one click instead of the doc's automatic Flow E,
 *   so AI credits are only spent when the tutor wants a set.
 * - `publishPracticeSet` is the ONLY way students gain read access: it copies
 *   the session's participants onto the row and flips it to `published`.
 */

import { enqueueJob } from 'deepspace/worker'
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { MAX_PRACTICE_SETS_PER_SESSION } from '../lib/limits'
import { requireTutor } from './guards'
import type { Envelope, PracticeSetData, SessionData } from './types'

export const PRACTICE_SET_JOB = 'practice-set'

export interface PracticeSetJobPayload {
  practiceSetId: string
}

type StartResult = { ok: true; practiceSetId: string } | { ok: false; error: string }

export async function startPracticeSet(env: Env, tools: ActionTools, session: Envelope<SessionData>): Promise<StartResult> {
  const used = session.data.practiceSetRuns ?? 0
  if (used >= MAX_PRACTICE_SETS_PER_SESSION) {
    return { ok: false, error: `This session has used its ${MAX_PRACTICE_SETS_PER_SESSION} practice sets` }
  }
  const existing = await tools.query('practiceSets', { where: { sessionId: session.recordId, status: 'generating' }, limit: 1 })
  if (existing.success && existing.data.count > 0) {
    return { ok: true, practiceSetId: existing.data.records[0].recordId }
  }
  const row = await tools.create('practiceSets', {
    sessionId: session.recordId,
    tutorId: session.createdBy,
    status: 'generating',
    progressMessage: 'Queued…',
    participantIds: [session.createdBy],
  })
  if (!row.success) return { ok: false, error: 'Could not start the practice set' }
  await tools.update('sessions', session.recordId, { practiceSetRuns: used + 1 })
  const payload: PracticeSetJobPayload = { practiceSetId: row.data.recordId }
  await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, PRACTICE_SET_JOB, payload, { maxAttempts: 1 })
  return { ok: true, practiceSetId: row.data.recordId }
}

/** Tutor (re)generates a practice set for an ended session. */
export const generatePracticeSet: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['closed'] })
  if (!g.ok) return { success: false, error: g.error }
  const r = await startPracticeSet(ctx.env, ctx.tools, g.session)
  return r.ok ? { success: true, data: { practiceSetId: r.practiceSetId } } : { success: false, error: r.error }
}

/** Tutor shares a ready practice set: the session's students can now read it. */
export const publishPracticeSet: ActionHandler<Env> = async (ctx) => {
  const id = ctx.params.practiceSetId
  if (typeof id !== 'string') return { success: false, error: 'Practice set not found' }
  const res = await ctx.tools.get<PracticeSetData>('practiceSets', id)
  if (!res.success) return { success: false, error: 'Practice set not found' }
  const set = res.data.record as Envelope<PracticeSetData>
  const g = await requireTutor(ctx, set.data.sessionId)
  if (!g.ok || set.data.tutorId !== ctx.userId) return { success: false, error: 'Practice set not found' }
  if (set.data.status !== 'ready' && set.data.status !== 'published') {
    return { success: false, error: 'The practice set is not ready yet' }
  }
  const students = Array.isArray(g.session.data.participantIds) ? g.session.data.participantIds : []
  const upd = await ctx.tools.update('practiceSets', set.recordId, {
    status: 'published',
    participantIds: [...new Set([ctx.userId, ...students])],
  })
  if (!upd.success) return { success: false, error: 'Could not publish' }
  return { success: true, data: { practiceSetId: set.recordId } }
}
