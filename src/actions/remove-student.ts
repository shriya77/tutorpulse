/**
 * `removeStudent`: the session's tutor takes a student out of a session
 * (someone who joined by mistake, or the wrong class). It
 *   - drops them from `participantIds` (so RBAC stops them reading the session),
 *   - records them in `removedIds` (so the join code no longer lets them back),
 *   - deletes their answers and working images in this session, their
 *     follow-up checks and their recap opt-in, so the board and the history
 *     no longer count them.
 * Groups that held one of their wrong answers are re-run on a live session
 * (the same as a student revising), so a label or explanation built on their
 * answer doesn't linger.
 */

import { appFiles } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { requestClustering } from './clustering-trigger'
import { activeParticipantIds, requireTutor } from './guards'
import { leaveSessionTeam } from './session-team'
import type { Envelope, ProblemData, SessionData, SubmissionData } from './types'

export const removeStudent: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['open', 'closed'] })
  if (!g.ok) return { success: false, error: g.error }
  const studentId = ctx.params.studentId
  const participants = Array.isArray(g.session.data.participantIds) ? g.session.data.participantIds : []
  if (typeof studentId !== 'string' || !participants.includes(studentId)) return { success: false, error: 'That student isn’t in this session' }
  const sessionId = g.session.recordId

  // Re-read just before writing: `participantIds` is replaced whole, and a join may have landed meanwhile.
  const fresh = await ctx.tools.get<SessionData>('sessions', sessionId)
  if (!fresh.success) return { success: false, error: 'Could not remove the student' }
  const data = fresh.data.record.data as SessionData
  const removed = Array.isArray(data.removedIds) ? data.removedIds : []
  const res = await ctx.tools.update('sessions', sessionId, {
    participantIds: activeParticipantIds(data).filter((id) => id !== studentId),
    removedIds: removed.includes(studentId) ? removed : [...removed, studentId],
  })
  if (!res.success) return { success: false, error: 'Could not remove the student' }
  await leaveSessionTeam(ctx.tools, sessionId, studentId)

  const subs = await ctx.tools.query<SubmissionData>('submissions', { where: { sessionId, studentId }, limit: 200 })
  const mine = subs.success ? (subs.data.records as Envelope<SubmissionData>[]) : []
  const files = appFiles(ctx.env, { scope: 'self', userId: studentId })
  for (const sub of mine) {
    if (sub.data.workKey) await files.delete(sub.data.workKey).catch(() => undefined) // best effort; the row is the only pointer
  }
  await ctx.tools.deleteWhere('submissions', { sessionId, studentId }, 500)
  await ctx.tools.deleteWhere('followUps', { sessionId, studentId }, 500)
  await ctx.tools.deleteWhere('recapRequests', { sessionId, studentId }, 10)

  if (g.session.data.status === 'open') {
    for (const problemId of new Set(mine.filter((s) => s.data.isCorrect === 0).map((s) => s.data.problemId))) {
      const p = await ctx.tools.get<ProblemData>('problems', problemId)
      if (p.success) await requestClustering(ctx.env, ctx.tools, p.data.record as Envelope<ProblemData>)
    }
  }
  return { success: true, data: { answers: mine.length } }
}
