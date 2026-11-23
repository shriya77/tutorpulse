/**
 * Display names (Settings).
 *
 * - `setDisplayName`: any signed-in user sets or clears their own TutorPulse
 *   display name (validated by `checkDisplayName`). Clearing goes back to the
 *   sign-in account's name. The person's DeepSpace account is never changed.
 * - `sessionDisplayNames`: the tutor of a session gets the display names of
 *   its students, and only those. Never raw `users` rows.
 * - `displayNamesFor`: server helper (history, recap emails): display name,
 *   else the account name.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { checkDisplayName } from '../lib/displayName'
import { requireTutor } from './guards'
import type { Envelope } from './types'

type DisplayNameRow = { userId: string; name: string }

async function ownRow(tools: ActionTools, userId: string): Promise<Envelope<DisplayNameRow> | undefined> {
  const res = await tools.query<DisplayNameRow>('displayNames', { where: { userId }, limit: 1 })
  return res.success ? (res.data.records as Envelope<DisplayNameRow>[])[0] : undefined
}

export const setDisplayName: ActionHandler<Env> = async (ctx) => {
  const check = checkDisplayName(ctx.params.name)
  if (!check.ok) return { success: false, error: check.error }
  const row = await ownRow(ctx.tools, ctx.userId)
  if (check.name === '') {
    if (row) await ctx.tools.remove('displayNames', row.recordId)
    return { success: true, data: { name: '' } }
  }
  const res = row
    ? await ctx.tools.update('displayNames', row.recordId, { name: check.name })
    : await ctx.tools.create('displayNames', { userId: ctx.userId, name: check.name })
  if (!res.success) return { success: false, error: 'Could not save your name' }
  return { success: true, data: { name: check.name } }
}

/** Display names for these users (falling back to the account name). Server-side only. */
export async function displayNamesFor(tools: ActionTools, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(
    ids.map(async (id) => {
      const own = await ownRow(tools, id)
      let name = own?.data.name
      if (!name) {
        const u = await tools.get<{ name?: string }>('users', id)
        name = u.success ? u.data.record.data.name : undefined
      }
      if (typeof name === 'string' && name.trim()) out[id] = name.trim().slice(0, 80)
    }),
  )
  return out
}

/** The tutor's roster: custom display names of this session's students only. */
export const sessionDisplayNames: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId)
  if (!g.ok) return { success: false, error: g.error }
  const ids = (Array.isArray(g.session.data.participantIds) ? g.session.data.participantIds : []).slice(0, 200)
  const names: Record<string, string> = {}
  await Promise.all(
    ids.map(async (id) => {
      const row = await ownRow(ctx.tools, id)
      if (row?.data.name) names[id] = row.data.name
    }),
  )
  return { success: true, data: { names } }
}
