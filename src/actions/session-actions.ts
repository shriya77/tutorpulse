/**
 * Session lifecycle actions: open (F2), join (F4), close.
 * Every action starts with a guard from ./guards and scopes all reads to the
 * session it returned.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { generateJoinCode, normalizeJoinCode } from '../lib/joinCode'
import { requireTutor } from './guards'
import type { Envelope, ProblemData, SessionData } from './types'

/** Tutor opens a draft session: assigns a unique join code and points students at problem 1. */
export const openSession: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['draft', 'open'] })
  if (!g.ok) return { success: false, error: g.error }
  const { session } = g
  if (session.data.status === 'open' && session.data.joinCode) {
    return { success: true, data: { joinCode: session.data.joinCode } }
  }

  // Only problems the tutor created count (see loadSessionProblem).
  const problems = await ctx.tools.query('problems', { where: { sessionId: session.recordId } })
  if (!problems.success) return { success: false, error: 'Could not load problems' }
  const own = (problems.data.records as Envelope<ProblemData>[])
    .filter((p) => p.createdBy === session.createdBy)
    .sort((a, b) => a.data.order - b.data.order)
  if (own.length === 0) return { success: false, error: 'Add at least one problem before opening the session' }

  let joinCode: string | null = null
  for (let attempt = 0; attempt < 5 && !joinCode; attempt++) {
    const candidate = generateJoinCode()
    const clash = await ctx.tools.query('sessions', { where: { joinCode: candidate, status: 'open' }, limit: 1 })
    if (clash.success && clash.data.count === 0) joinCode = candidate
  }
  if (!joinCode) return { success: false, error: 'Could not allocate a join code, try again' }

  const res = await ctx.tools.update('sessions', session.recordId, {
    status: 'open',
    joinCode,
    currentProblemId: session.data.currentProblemId || own[0].recordId,
  })
  if (!res.success) return { success: false, error: 'Could not open the session' }
  return { success: true, data: { joinCode } }
}

/**
 * Tutor ends the session: no more joins or submissions. The practice set is
 * then one click away in the wrap-up panel (`generatePracticeSet`) rather
 * than automatic, so the tutor decides when to spend AI credits on it.
 */
export const closeSession: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['open', 'draft'] })
  if (!g.ok) return { success: false, error: g.error }
  const res = await ctx.tools.update('sessions', g.session.recordId, { status: 'closed', focusLabel: '' })
  if (!res.success) return { success: false, error: 'Could not close the session' }
  return { success: true, data: { sessionId: g.session.recordId } }
}

const NO_SESSION = 'No open session with that code'

/**
 * Student joins by code. The code is the only thing that proves they were
 * invited, so a wrong or closed code gets one generic error.
 *
 * `participantIds` is a JSON array and `update` replaces it whole, so two
 * students joining at the same instant could overwrite each other. We
 * re-read after writing and retry until the caller is present.
 */
export const joinSession: ActionHandler<Env> = async (ctx) => {
  const joinCode = normalizeJoinCode(ctx.params.joinCode)
  if (!joinCode) return { success: false, error: NO_SESSION }

  const found = await ctx.tools.query('sessions', { where: { joinCode, status: 'open' }, limit: 2 })
  if (!found.success || found.data.count !== 1) return { success: false, error: NO_SESSION }
  const session = found.data.records[0] as Envelope<SessionData>

  if (session.createdBy === ctx.userId) {
    return { success: true, data: { sessionId: session.recordId, role: 'tutor' } }
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const fresh = await ctx.tools.get('sessions', session.recordId)
    if (!fresh.success) return { success: false, error: NO_SESSION }
    const data = fresh.data.record.data as SessionData
    if (data.status !== 'open') return { success: false, error: NO_SESSION }
    const current = Array.isArray(data.participantIds) ? data.participantIds : []
    if (current.includes(ctx.userId)) {
      return { success: true, data: { sessionId: session.recordId, role: 'student' } }
    }
    await ctx.tools.update('sessions', session.recordId, { participantIds: [...current, ctx.userId] })
  }
  return { success: false, error: 'Too many people joined at once, please try again' }
}
