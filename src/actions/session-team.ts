/**
 * Session "teams" (see src/schemas/team-members-schema.ts): a student is in
 * a session's team exactly while they're a participant, which is what lets
 * them read its problems. Server-only helpers; callers have already run a guard.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { requireParticipant } from './guards'

type Member = { recordId: string }

async function memberships(tools: ActionTools, sessionId: string, userId: string): Promise<Member[]> {
  const res = await tools.query('team_members', { where: { TeamId: sessionId, UserId: userId }, limit: 10 })
  return res.success ? (res.data.records as Member[]) : []
}

/** Add the student to the session's team (idempotent; a duplicate insert just fails on uniqueOn). */
export async function joinSessionTeam(tools: ActionTools, sessionId: string, userId: string): Promise<boolean> {
  if ((await memberships(tools, sessionId, userId)).length > 0) return true
  const res = await tools.create('team_members', { TeamId: sessionId, UserId: userId, status: 'active' })
  return res.success || (await memberships(tools, sessionId, userId)).length > 0
}

/**
 * Take the student out of the session's team. Row by row (not deleteWhere),
 * because a single-row delete is what makes the SDK tell their open pages to
 * resubscribe, so the problems disappear for them straight away.
 */
export async function leaveSessionTeam(tools: ActionTools, sessionId: string, userId: string): Promise<void> {
  for (const m of await memberships(tools, sessionId, userId)) await tools.remove('team_members', m.recordId)
}

/**
 * A joined student makes sure they're in their session's team. The student
 * page calls it once on load: it fills in membership for students who joined
 * before teams existed, and repairs it if a write was ever lost.
 */
export const ensureSessionAccess: ActionHandler<Env> = async (ctx) => {
  const g = await requireParticipant(ctx, ctx.params.sessionId)
  if (!g.ok) return { success: false, error: g.error }
  const ok = await joinSessionTeam(ctx.tools, g.session.recordId, ctx.userId)
  return ok ? { success: true, data: { ok: true } } : { success: false, error: 'Could not load the problems' }
}
