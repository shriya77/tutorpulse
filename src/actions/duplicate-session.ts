/**
 * `duplicateSession`: the session's tutor starts a new draft with the same
 * title (plus " (copy)"), course week, problems and answer keys, to run the
 * same problems with another group. Nothing about students comes across: no
 * participants, answers, groups, follow-ups, practice sets or notes. The copy
 * gets its own join code when it's opened.
 *
 * Rows are created by the caller (actions stamp `createdBy` with the caller),
 * so the copy's problems and keys are trusted like ones typed by hand.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { requireTutor } from './guards'
import type { AnswerKeyData, Envelope, ProblemData } from './types'

const MAX_TITLE = 120
const MAX_PROBLEMS = 100

export function copyTitle(title: string): string {
  const base = title.replace(/\s*\(copy( \d+)?\)$/, '').trim()
  const suffix = ' (copy)'
  return base.length + suffix.length > MAX_TITLE ? `${base.slice(0, MAX_TITLE - suffix.length - 1)}…${suffix}` : `${base}${suffix}`
}

export const duplicateSession: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId)
  if (!g.ok) return { success: false, error: g.error }
  const session = g.session

  const probRes = await ctx.tools.query<ProblemData>('problems', { where: { sessionId: session.recordId }, limit: 500 })
  const problems = (probRes.success ? (probRes.data.records as Envelope<ProblemData>[]) : [])
    .filter((p) => p.createdBy === session.createdBy && p.data.followUp !== 1)
    .sort((a, b) => a.data.order - b.data.order)
    .slice(0, MAX_PROBLEMS)

  const created = await ctx.tools.create('sessions', {
    title: copyTitle(session.data.title),
    ...(session.data.topic ? { topic: session.data.topic } : {}),
  })
  if (!created.success) return { success: false, error: 'Could not copy the session' }
  const newId = created.data.recordId

  let copied = 0
  for (const [i, p] of problems.entries()) {
    const np = await ctx.tools.create('problems', { sessionId: newId, order: i, prompt: p.data.prompt, status: 'open' })
    if (!np.success) continue
    copied++
    const keys = await ctx.tools.query<AnswerKeyData>('answerKeys', { where: { problemId: p.recordId }, limit: 10 })
    const key = (keys.success ? (keys.data.records as Envelope<AnswerKeyData>[]) : []).find((k) => k.createdBy === session.createdBy)
    if (key) {
      await ctx.tools.create('answerKeys', {
        problemId: np.data.recordId,
        answer: key.data.answer,
        ...(key.data.expectedMistakes ? { expectedMistakes: key.data.expectedMistakes } : {}),
      })
    }
  }
  return { success: true, data: { sessionId: newId, problems: copied } }
}
