/**
 * Owner-level record reads for worker routes that are not server actions
 * (WebSocket gates, file downloads, the chat route). These bypass RBAC
 * (`X-App-Action`), exactly like action `tools.*`, so every caller must check
 * the user's access itself before returning anything.
 */

import type { Env } from '../../worker.js'
import type { Envelope, SessionData } from '../actions/types.js'

async function ownerTool<T>(env: Env, tool: string, params: Record<string, unknown>): Promise<T | null> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  try {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': env.OWNER_USER_ID, 'X-App-Action': 'true' },
        body: JSON.stringify({ tool, params }),
      }),
    )
    const json = (await res.json()) as { success?: boolean; data?: T }
    return json.success ? (json.data ?? null) : null
  } catch {
    return null
  }
}

export async function getRecord<T>(env: Env, collection: string, recordId: string): Promise<Envelope<T> | null> {
  const data = await ownerTool<{ record?: Envelope<T> }>(env, 'records.get', { collection, recordId })
  return data?.record ?? null
}

export async function queryRecords<T>(env: Env, collection: string, where: Record<string, unknown>, limit = 200): Promise<Envelope<T>[]> {
  const data = await ownerTool<{ records?: Envelope<T>[] }>(env, 'records.query', { collection, where, limit })
  return data?.records ?? []
}

export async function updateRecord(env: Env, collection: string, recordId: string, data: Record<string, unknown>): Promise<boolean> {
  return (await ownerTool(env, 'records.update', { collection, recordId, data })) !== null
}

export function isMemberOf(session: Envelope<SessionData>, userId: string): boolean {
  const participants = Array.isArray(session.data.participantIds) ? session.data.participantIds : []
  return session.createdBy === userId || participants.includes(userId)
}

/** True when the user is the session's tutor (creator) or a joined student. */
export async function isSessionMember(env: Env, sessionId: string, userId: string): Promise<boolean> {
  const session = await getRecord<SessionData>(env, 'sessions', sessionId)
  return !!session && isMemberOf(session, userId)
}

/**
 * The open session this user is in right now (most recently updated), as
 * tutor or student. The hint assistant is scoped to it, so a student can
 * never point it at another session.
 */
export async function findActiveSession(
  env: Env,
  userId: string,
): Promise<{ session: Envelope<SessionData>; role: 'tutor' | 'student' } | null> {
  const open = await queryRecords<SessionData>(env, 'sessions', { status: 'open' })
  const mine = open
    .filter((s) => isMemberOf(s, userId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return mine ? { session: mine, role: mine.createdBy === userId ? 'tutor' : 'student' } : null
}
