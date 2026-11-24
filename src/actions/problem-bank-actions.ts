/**
 * `pastProblems`: the caller's own problems from their other sessions, with
 * their answer keys, for "Add from your past problems". One read when the
 * panel opens instead of a live subscription to everything they've written.
 * Scoped to rows the caller created (RBAC is off in actions); follow-up
 * checks are left out, and identical problems (same prompt and key) appear
 * once, newest first.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AnswerKeyData, Envelope, ProblemData, SessionData } from './types'

const MAX_ROWS = 300
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export interface PastProblem {
  problemId: string
  prompt: string
  answer: string | null
  expectedMistakes: string
  sessionTitle: string
  topic: string
}

export const pastProblems: ActionHandler<Env> = async (ctx) => {
  const exclude = typeof ctx.params.excludeSessionId === 'string' ? ctx.params.excludeSessionId : ''
  const me = ctx.userId
  const [sessRes, probRes, keyRes] = await Promise.all([
    ctx.tools.query<SessionData>('sessions', { where: { createdBy: me }, limit: 500 }),
    ctx.tools.query<ProblemData>('problems', { where: { createdBy: me }, limit: 2000 }),
    ctx.tools.query<AnswerKeyData>('answerKeys', { where: { createdBy: me }, limit: 2000 }),
  ])
  if (!sessRes.success || !probRes.success || !keyRes.success) return { success: false, error: 'Could not load your problems' }
  const sessions = new Map((sessRes.data.records as Envelope<SessionData>[]).filter((s) => s.createdBy === me).map((s) => [s.recordId, s]))
  const keys = new Map((keyRes.data.records as Envelope<AnswerKeyData>[]).filter((k) => k.createdBy === me).map((k) => [k.data.problemId, k.data]))
  const seen = new Set<string>()
  const rows: PastProblem[] = []
  for (const p of (probRes.data.records as Envelope<ProblemData>[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const session = sessions.get(p.data.sessionId)
    if (p.createdBy !== me || p.data.followUp === 1 || !session || p.data.sessionId === exclude) continue
    const key = keys.get(p.recordId)
    const id = `${norm(p.data.prompt)}|${norm(key?.answer ?? '')}`
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({
      problemId: p.recordId,
      prompt: p.data.prompt,
      answer: key?.answer ?? null,
      expectedMistakes: key?.expectedMistakes ?? '',
      sessionTitle: session.data.title,
      topic: session.data.topic ?? '',
    })
    if (rows.length >= MAX_ROWS) break
  }
  return { success: true, data: { problems: rows } }
}
