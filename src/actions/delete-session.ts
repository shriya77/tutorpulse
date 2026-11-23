/**
 * `deleteSession`: the session's tutor permanently deletes a draft or ended
 * session and everything it owns, for everyone:
 *   problems and their answer keys, every student's answers and working
 *   images (in each student's private folder), misconception groups,
 *   follow-up checks, recap opt-ins, practice sets (and their PDFs), and
 *   notes (their files and their copies in the knowledge base).
 * A live session must be ended first, so a class can't vanish mid-session.
 * Files and knowledge items are removed best-effort; records are the source
 * of truth, and without them nothing can reach the files again.
 */

import { appFiles, isTestAccountEmail, knowledge } from 'deepspace/worker'
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { requireTutor } from './guards'
import type { Envelope, SessionData } from './types'

const PAGE = 500

/** Delete every matching row, a page at a time. */
async function deleteAll(tools: ActionTools, collection: string, where: Record<string, unknown>): Promise<number> {
  let total = 0
  for (let i = 0; i < 40; i++) {
    const res = await tools.deleteWhere(collection, where, PAGE)
    if (!res.success) break
    total += res.data.deleted
    if (res.data.deleted < PAGE) break
  }
  return total
}

async function rows<T>(tools: ActionTools, collection: string, where: Record<string, unknown>): Promise<Envelope<T>[]> {
  const res = await tools.query<Record<string, unknown>>(collection, { where, limit: 1000 })
  return res.success ? (res.data.records as unknown as Envelope<T>[]) : []
}

/** Delete a session and everything it owns. The caller has already proved they're its tutor. */
async function deleteSessionData(env: Env, tools: ActionTools, tutorId: string, session: Envelope<SessionData>) {
  const sessionId = session.recordId
  const tutorFiles = appFiles(env, { scope: 'self', userId: tutorId })
  let files = 0

  // Students' working images live in their own folders.
  for (const s of await rows<{ studentId: string; workKey?: string }>(tools, 'submissions', { sessionId })) {
    if (!s.data.workKey) continue
    try {
      if ((await appFiles(env, { scope: 'self', userId: s.data.studentId }).delete(s.data.workKey)).existed) files++
    } catch {
      // Best effort: the submission row (the only pointer to it) is deleted below.
    }
  }
  // Practice-set PDFs and notes files live in the tutor's folder; notes are also indexed.
  for (const p of await rows<{ fileKey?: string }>(tools, 'practiceSets', { sessionId })) {
    if (p.data.fileKey) await tutorFiles.delete(p.data.fileKey).then((r) => r.existed && files++).catch(() => undefined)
  }
  const kb = knowledge(env)
  for (const n of await rows<{ fileKey?: string; knowledgeItemIds?: string[] }>(tools, 'sessionNotes', { sessionId })) {
    if (n.data.fileKey) await tutorFiles.delete(n.data.fileKey).then((r) => r.existed && files++).catch(() => undefined)
    for (const id of Array.isArray(n.data.knowledgeItemIds) ? n.data.knowledgeItemIds : []) await kb.remove(id).catch(() => undefined)
  }

  let records = 0
  for (const p of await rows(tools, 'problems', { sessionId })) records += await deleteAll(tools, 'answerKeys', { problemId: p.recordId })
  for (const collection of ['submissions', 'clusters', 'followUps', 'recapRequests', 'practiceSets', 'sessionNotes', 'problems']) {
    records += await deleteAll(tools, collection, { sessionId })
  }
  const removed = await tools.remove('sessions', sessionId)
  return { ok: removed.success, records: records + 1, files }
}

export const deleteSession: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['draft', 'closed'] })
  if (!g.ok) return { success: false, error: g.error.startsWith('Session is') ? 'End the session before deleting it' : g.error }
  const r = await deleteSessionData(ctx.env, ctx.tools, ctx.userId, g.session)
  if (!r.ok) return { success: false, error: 'Could not delete the session' }
  return { success: true, data: { records: r.records, files: r.files } }
}

/**
 * Test cleanup that also works on the deployed app, so live test runs don't
 * leave sessions on the shared test accounts. Narrower than `deleteSession`
 * except that the session may still be live: only a `@deepspace.test` caller,
 * only a session they created, only one titled `__test-…`.
 */
export const cleanupTestSession: ActionHandler<Env> = async (ctx) => {
  const me = await ctx.tools.get<{ email?: string }>('users', ctx.userId)
  if (!me.success || !isTestAccountEmail(me.data.record.data.email)) return { success: false, error: 'Test accounts only' }
  const g = await requireTutor(ctx, ctx.params.sessionId)
  if (!g.ok) return { success: true, data: { deleted: 0 } } // already gone, or not theirs: nothing to do
  if (!g.session.data.title?.startsWith('__test-')) return { success: false, error: 'Not a test session' }
  const r = await deleteSessionData(ctx.env, ctx.tools, ctx.userId, g.session)
  if (!r.ok) return { success: false, error: 'Could not delete the session' }
  return { success: true, data: { records: r.records, files: r.files } }
}
