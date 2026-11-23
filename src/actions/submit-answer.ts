/**
 * submitAnswer (F6, F7) — the only writer of `submissions`.
 *
 * 1. Prove the problem belongs to its session and the caller joined it.
 * 2. Refuse if the session isn't open or the problem is locked.
 * 3. Check the answer against the tutor's key with mathjs (src/lib/answerCheck).
 * 4. Upsert the caller's single submission for this problem, stamping
 *    `studentId` (owner) and `tutorIds` (readers) from verified identity.
 * 5. If the set of wrong answers changed, ask for re-clustering (debounced).
 *
 * Optional `workKey`: the student's handwritten working, already uploaded to
 * THEIR private folder. It is re-read from the caller's own folder (a key in
 * anyone else's folder is refused by appFiles) and must be a small PNG drawing
 * or an EXIF-free JPEG photo (see src/lib/work.ts), so a
 * student can never point their submission at someone else's file.
 *
 * The student is told only that the answer was saved, not whether it was
 * correct: the tool is formative, and revealing the verdict would let a
 * student guess-and-check their way to the key.
 */

import { appFiles } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { checkAnswer, type Verdict } from '../lib/answerCheck'
import { MAX_WORK_BYTES } from '../lib/limits'
import { workImageType } from '../lib/work'
import { requestClustering } from './clustering-trigger'
import { loadSessionProblem, PROBLEM_NOT_FOUND, requireParticipant } from './guards'
import type { AnswerKeyData, Envelope, SubmissionData } from './types'

export const MAX_ANSWER_LENGTH = 200
export const MAX_EXPLANATION_LENGTH = 280

export const submitAnswer: ActionHandler<Env> = async (ctx) => {
  const answer = typeof ctx.params.answer === 'string' ? ctx.params.answer.trim() : ''
  const explanation = typeof ctx.params.explanation === 'string' ? ctx.params.explanation.trim() : ''
  if (!answer) return { success: false, error: 'Enter an answer' }
  if (answer.length > MAX_ANSWER_LENGTH) return { success: false, error: `Keep the answer under ${MAX_ANSWER_LENGTH} characters` }
  if (explanation.length > MAX_EXPLANATION_LENGTH) {
    return { success: false, error: `Keep the explanation under ${MAX_EXPLANATION_LENGTH} characters` }
  }

  const workKey = typeof ctx.params.workKey === 'string' ? ctx.params.workKey.trim() : ''
  if (workKey) {
    if (workKey.length > 300) return { success: false, error: 'Could not read your working' }
    const work = await readOwnWork(ctx.env, ctx.userId, workKey)
    if (!work.ok) return { success: false, error: work.error }
  }

  const p = await loadSessionProblem(ctx, ctx.params.problemId)
  if (!p.ok) return { success: false, error: p.error }
  const { problem } = p
  const g = await requireParticipant(ctx, problem.data.sessionId, { statuses: ['open'] })
  if (!g.ok) return { success: false, error: g.error }
  const { session } = g
  if (problem.data.status === 'locked') return { success: false, error: 'This problem is locked' }
  // A follow-up check is only for the students it was sent to.
  if (problem.data.followUp === 1) {
    const mine = await ctx.tools.query('followUps', { where: { problemId: problem.recordId, studentId: ctx.userId }, limit: 1 })
    if (!mine.success || mine.data.count === 0) return { success: false, error: PROBLEM_NOT_FOUND }
  }

  // The key must be the tutor's own; a key planted by anyone else is ignored.
  const keys = await ctx.tools.query('answerKeys', { where: { problemId: problem.recordId } })
  const key = keys.success
    ? (keys.data.records as Envelope<AnswerKeyData>[]).find((k) => k.createdBy === problem.createdBy)
    : undefined
  const verdict: Verdict = key ? checkAnswer(answer, key.data.answer).verdict : 'needs_review'

  const existing = await ctx.tools.query('submissions', {
    where: { problemId: problem.recordId, studentId: ctx.userId },
    limit: 1,
  })
  if (!existing.success) return { success: false, error: 'Could not save your answer' }
  const previous = existing.data.records[0] as Envelope<SubmissionData> | undefined

  const row = {
    answer,
    explanation,
    isCorrect: verdict === 'correct' ? 1 : 0,
    needsReview: verdict === 'needs_review' ? 1 : 0,
    revision: (previous?.data.revision ?? 0) + 1,
    tutorIds: [session.createdBy],
    workKey,
  }
  const saved = previous
    ? await ctx.tools.update('submissions', previous.recordId, row)
    : await ctx.tools.create('submissions', {
        ...row,
        sessionId: session.recordId,
        problemId: problem.recordId,
        studentId: ctx.userId,
      })
  if (!saved.success) return { success: false, error: 'Could not save your answer' }

  // Re-cluster when this student is now wrong, or was wrong and is now right
  // (their answer leaves its cluster, so the count should fall live).
  const wasWrong = previous ? previous.data.isCorrect !== 1 : false
  if (verdict !== 'correct' || wasWrong) await requestClustering(ctx.env, ctx.tools, problem)

  return { success: true, data: { revision: row.revision } }
}

/** Read a working image from the CALLER's own private folder and check it. */
async function readOwnWork(env: Env, userId: string, key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await appFiles(env, { scope: 'self', userId }).download(key)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > MAX_WORK_BYTES) return { ok: false, error: 'Your working image is too large' }
    if (!workImageType(bytes)) return { ok: false, error: 'Your working must be a drawing or photo from the app' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not read your working' }
  }
}
