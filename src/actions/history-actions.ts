/**
 * tutorHistory: the caller's past sessions and per-student trends.
 *
 * Scoped by listTutorSessions (only sessions the caller created); every
 * submission and cluster query is per one of those session ids. Student
 * names are the only user data returned (never raw `users` rows). This is a
 * tutor-only page with names, unlike the anonymous board that goes on the
 * projector.
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { displayNamesFor } from './profile-actions'
import { buildHistory, type HistoryInput } from '../lib/history'
import { listTutorSessions } from './guards'
import type { ClusterData, Envelope, SubmissionData } from './types'

const MAX_SESSIONS = 20
const MAX_SCANNED = 200
const MAX_NAMES = 120
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Optional filters: `days` (only sessions from the last N days) and `topic`
 * (one course week id). The newest 20 matching sessions are used. `topics`
 * lists the weeks the caller's sessions use, for the filter menu.
 */
export const tutorHistory: ActionHandler<Env> = async (ctx) => {
  const days = typeof ctx.params.days === 'number' && ctx.params.days > 0 ? Math.min(ctx.params.days, 3660) : null
  const topic = typeof ctx.params.topic === 'string' ? ctx.params.topic.slice(0, 60) : ''
  const since = days ? Date.now() - days * DAY_MS : null
  const all = (await listTutorSessions(ctx, MAX_SCANNED)).filter((s) => s.data.status !== 'draft')
  const topics = [...new Set(all.map((s) => s.data.topic).filter((t): t is string => !!t))]
  const matching = all.filter((s) => (!since || Date.parse(s.createdAt) >= since) && (!topic || s.data.topic === topic))
  const own = matching.slice(0, MAX_SESSIONS)
  const input: HistoryInput = { sessions: [], submissions: [], clusters: [], names: {} }
  for (const s of own) {
    input.sessions.push({
      id: s.recordId,
      title: s.data.title,
      createdAt: s.createdAt,
      status: s.data.status,
      participantIds: Array.isArray(s.data.participantIds) ? s.data.participantIds : [],
      topic: s.data.topic,
    })
    const [subs, clusters] = await Promise.all([
      ctx.tools.query<SubmissionData>('submissions', { where: { sessionId: s.recordId }, limit: 500 }),
      ctx.tools.query<ClusterData>('clusters', { where: { sessionId: s.recordId }, limit: 200 }),
    ])
    if (subs.success) {
      for (const x of subs.data.records as Envelope<SubmissionData>[]) {
        input.submissions.push({ id: x.recordId, sessionId: s.recordId, studentId: x.data.studentId, problemId: x.data.problemId, isCorrect: x.data.isCorrect })
      }
    }
    if (clusters.success) {
      for (const c of clusters.data.records as Envelope<ClusterData>[]) {
        input.clusters.push({ sessionId: s.recordId, label: c.data.label, submissionIds: Array.isArray(c.data.submissionIds) ? c.data.submissionIds : [] })
      }
    }
  }
  const ids = new Set<string>()
  for (const s of input.sessions) for (const p of s.participantIds) ids.add(p)
  for (const x of input.submissions) ids.add(x.studentId)
  Object.assign(input.names, await displayNamesFor(ctx.tools, [...ids].slice(0, MAX_NAMES)))
  return { success: true, data: { ...buildHistory(input), topics, matching: matching.length } }
}
