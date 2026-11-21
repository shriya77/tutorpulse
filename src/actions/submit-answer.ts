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
 * The student is told only that the answer was saved, not whether it was
 * correct: the tool is formative, and revealing the verdict would let a
 * student guess-and-check their way to the key.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { checkAnswer, type Verdict } from '../lib/answerCheck'
import { requestClustering } from './clustering-trigger'
import { loadSessionProblem, requireParticipant } from './guards'
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

  const p = await loadSessionProblem(ctx, ctx.params.problemId)
  if (!p.ok) return { success: false, error: p.error }
  const { problem } = p
  const g = await requireParticipant(ctx, problem.data.sessionId, { statuses: ['open'] })
  if (!g.ok) return { success: false, error: g.error }
  const { session } = g
  if (problem.data.status === 'locked') return { success: false, error: 'This problem is locked' }

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
