/**
 * Recap emails (opt-in, after the session).
 *
 * - `setRecapEmail`: a joined student ticks or unticks "Email me a recap" for
 *   this one session. Stored in `recapRequests` (server-written only).
 * - `sendRecaps`: the tutor of an ENDED session sends each opted-in student
 *   their own recap through the DeepSpace `email/send` integration
 *   (owner-billed). Each student is emailed at most once per session
 *   (`sentAt`). Addresses are read server-side from `users` and never
 *   returned or logged; the tutor only gets counts. @deepspace.test accounts
 *   are marked but never emailed, so tests don't send real mail.
 */

import { isTestAccountEmail } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { OTHER_LABEL } from '../lib/clusters'
import { MAX_RECAP_EMAILS_PER_SEND } from '../lib/limits'
import { buildRecapEmail, type RecapProblem } from '../lib/recapEmail'
import { requireParticipant, requireTutor } from './guards'
import type { ClusterData, Envelope, ProblemData, RecapRequestData, SubmissionData } from './types'

/** Student opts in (or out) of a recap email for this session. */
export const setRecapEmail: ActionHandler<Env> = async (ctx) => {
  const g = await requireParticipant(ctx, ctx.params.sessionId)
  if (!g.ok) return { success: false, error: g.error }
  if (typeof ctx.params.wantsEmail !== 'boolean') return { success: false, error: 'wantsEmail must be true or false' }
  const wantsEmail = ctx.params.wantsEmail ? 1 : 0

  const found = await ctx.tools.query<RecapRequestData>('recapRequests', { where: { sessionId: g.session.recordId, studentId: ctx.userId }, limit: 1 })
  const row = found.success ? (found.data.records[0] as Envelope<RecapRequestData> | undefined) : undefined
  if (row?.data.sentAt) return { success: true, data: { sent: true } }
  const res = row
    ? await ctx.tools.update('recapRequests', row.recordId, { wantsEmail })
    : await ctx.tools.create('recapRequests', { sessionId: g.session.recordId, studentId: ctx.userId, tutorIds: [g.session.createdBy], wantsEmail })
  if (!res.success) return { success: false, error: 'Could not save that' }
  return { success: true, data: { wantsEmail: wantsEmail === 1 } }
}

/** One student's own results, problem by problem. Exported for unit testing. */
export function studentResults(
  problems: Envelope<ProblemData>[],
  mine: Envelope<SubmissionData>[],
  clusters: Envelope<ClusterData>[],
): RecapProblem[] {
  return problems.map((p, i) => {
    const sub = mine.find((s) => s.data.problemId === p.recordId)
    if (!sub) return { number: i + 1, status: 'not_answered' }
    if (sub.data.isCorrect === 1) return { number: i + 1, status: 'correct' }
    if (sub.data.needsReview === 1) return { number: i + 1, status: 'needs_review', answer: sub.data.answer }
    const group = clusters.find((c) => c.data.problemId === p.recordId && c.data.label !== OTHER_LABEL && (c.data.submissionIds ?? []).includes(sub.recordId))
    return { number: i + 1, status: 'incorrect', answer: sub.data.answer, mistake: group?.data.label }
  })
}

/** Tutor emails every opted-in student who hasn't had their recap yet. Returns counts only. */
export const sendRecaps: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['closed'] })
  if (!g.ok) return { success: false, error: g.error }
  const session = g.session
  const participants = new Set(Array.isArray(session.data.participantIds) ? session.data.participantIds : [])

  const reqs = await ctx.tools.query<RecapRequestData>('recapRequests', { where: { sessionId: session.recordId }, limit: 200 })
  const pending = (reqs.success ? (reqs.data.records as Envelope<RecapRequestData>[]) : [])
    .filter((r) => r.data.wantsEmail === 1 && !r.data.sentAt && participants.has(r.data.studentId))
    .slice(0, MAX_RECAP_EMAILS_PER_SEND)
  if (pending.length === 0) return { success: true, data: { sent: 0, testAccounts: 0, failed: 0 } }

  const probRes = await ctx.tools.query<ProblemData>('problems', { where: { sessionId: session.recordId }, limit: 100 })
  const problems = (probRes.success ? (probRes.data.records as Envelope<ProblemData>[]) : [])
    .filter((p) => p.createdBy === session.createdBy && p.data.followUp !== 1)
    .sort((a, b) => a.data.order - b.data.order)
  const clRes = await ctx.tools.query<ClusterData>('clusters', { where: { sessionId: session.recordId }, limit: 200 })
  const clusters = clRes.success ? (clRes.data.records as Envelope<ClusterData>[]) : []
  const shared = await ctx.tools.query('practiceSets', { where: { sessionId: session.recordId, status: 'published' }, limit: 1 })
  const practiceSetShared = shared.success && shared.data.count > 0
  const sessionUrl = `https://${ctx.env.APP_NAME}.app.space/sessions/${session.recordId}`

  let sent = 0
  let testAccounts = 0
  let failed = 0
  for (const r of pending) {
    const user = await ctx.tools.get<{ email?: string; name?: string }>('users', r.data.studentId)
    const email = user.success ? user.data.record.data.email : undefined
    if (typeof email !== 'string' || !email.includes('@')) {
      failed++
      continue
    }
    const subs = await ctx.tools.query<SubmissionData>('submissions', { where: { sessionId: session.recordId, studentId: r.data.studentId }, limit: 100 })
    const mine = subs.success ? (subs.data.records as Envelope<SubmissionData>[]) : []
    const mail = buildRecapEmail({
      studentName: (user.success && user.data.record.data.name) || '',
      sessionTitle: session.data.title,
      sessionUrl,
      problems: studentResults(problems, mine, clusters),
      practiceSetShared,
    })

    let delivery: 'sent' | 'test_account'
    if (isTestAccountEmail(email)) {
      delivery = 'test_account'
      testAccounts++
    } else {
      const res = await ctx.tools.integration('email/send', { to: email, subject: mail.subject, text: mail.text, html: mail.html })
      if (!res.success) {
        failed++
        console.warn('[recap] send failed', res.error?.slice(0, 120))
        continue
      }
      delivery = 'sent'
      sent++
    }
    await ctx.tools.update('recapRequests', r.recordId, { sentAt: new Date().toISOString(), delivery })
  }
  return { success: true, data: { sent, testAccounts, failed } }
}
