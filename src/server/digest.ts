/**
 * Weekly digest, server side: gather one tutor's data and send their email.
 * Used by the weekly cron task (src/cron.ts) and the Settings preview
 * (`sendDigestPreview`). Reads go through a small `Reader` so the same code
 * runs with an action's tools or the cron context's records; every query is
 * scoped to sessions the tutor created.
 *
 * Opt-in only (`digestPrefs.weekly`), at most once per 6 days per tutor, never
 * for a week with no sessions, and @deepspace.test accounts are marked but
 * never emailed. Addresses are read here and never stored or returned.
 */

import { isTestAccountEmail } from 'deepspace/worker'
import type { ActionTools } from 'deepspace/worker'
import type { Envelope, ClusterData, SessionData, SubmissionData } from '../actions/types'
import { buildDigest, isEmptyDigest, type DigestEmail } from '../lib/digest'
import { buildHistory, type HistoryInput } from '../lib/history'

export type Reader = (collection: string, where: Record<string, unknown>, limit?: number) => Promise<Envelope<Record<string, unknown>>[]>

export const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SESSIONS = 40
const MAX_NAMES = 150

/** A Reader over an action's tools (RBAC is off in actions; callers scope the where). */
export function actionReader(tools: ActionTools): Reader {
  return async (collection, where, limit = 500) => {
    const r = await tools.query<Record<string, unknown>>(collection, { where, limit })
    return r.success ? (r.data.records as Envelope<Record<string, unknown>>[]) : []
  }
}

async function nameOf(read: Reader, userId: string): Promise<string> {
  const own = (await read('displayNames', { userId }, 1))[0]?.data.name
  if (typeof own === 'string' && own.trim()) return own.trim().slice(0, 80)
  const u = (await read('users', { recordId: userId }, 1))[0]?.data.name
  return typeof u === 'string' && u.trim() ? u.trim().slice(0, 80) : ''
}

async function historyInput(read: Reader, sessions: Envelope<SessionData>[]): Promise<HistoryInput> {
  const input: HistoryInput = { sessions: [], submissions: [], clusters: [], names: {} }
  for (const s of sessions) {
    input.sessions.push({
      id: s.recordId,
      title: s.data.title,
      createdAt: s.createdAt,
      status: s.data.status,
      participantIds: Array.isArray(s.data.participantIds) ? s.data.participantIds : [],
      topic: s.data.topic,
    })
    for (const x of (await read('submissions', { sessionId: s.recordId })) as unknown as Envelope<SubmissionData>[]) {
      input.submissions.push({ id: x.recordId, sessionId: s.recordId, studentId: x.data.studentId, problemId: x.data.problemId, isCorrect: x.data.isCorrect })
    }
    for (const c of (await read('clusters', { sessionId: s.recordId }, 200)) as unknown as Envelope<ClusterData>[]) {
      input.clusters.push({ sessionId: s.recordId, label: c.data.label, submissionIds: Array.isArray(c.data.submissionIds) ? c.data.submissionIds : [] })
    }
  }
  const ids = new Set<string>()
  for (const s of input.sessions) for (const p of s.participantIds) ids.add(p)
  for (const x of input.submissions) ids.add(x.studentId)
  for (const id of [...ids].slice(0, MAX_NAMES)) {
    const n = await nameOf(read, id)
    if (n) input.names[id] = n
  }
  return input
}

/** The tutor's digest for the 7 days up to `now`, or null when they ran no sessions in it. */
export async function buildTutorDigest(read: Reader, tutorId: string, now: Date, appName: string): Promise<DigestEmail | null> {
  const own = ((await read('sessions', { createdBy: tutorId })) as unknown as Envelope<SessionData>[])
    .filter((s) => s.createdBy === tutorId && s.data.status !== 'draft')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const weekStart = now.getTime() - 7 * DAY_MS
  const monthStart = now.getTime() - 28 * DAY_MS
  const week = own.filter((s) => Date.parse(s.createdAt) >= weekStart).slice(0, MAX_SESSIONS)
  if (week.length === 0) return null
  const month = own.filter((s) => Date.parse(s.createdAt) >= monthStart).slice(0, MAX_SESSIONS)
  const weekHistory = buildHistory(await historyInput(read, week))
  if (isEmptyDigest({ week: weekHistory })) return null
  const monthHistory = buildHistory(await historyInput(read, month))
  const base = `https://${appName}.app.space`
  return buildDigest({
    tutorName: await nameOf(read, tutorId),
    from: new Date(weekStart),
    to: now,
    week: weekHistory,
    month: monthHistory,
    historyUrl: `${base}/history`,
    settingsUrl: `${base}/settings`,
  })
}

export type DigestOutcome = 'sent' | 'test_account' | 'empty' | 'no_email' | 'failed'

/**
 * Build and send one tutor's digest. `send` performs the email/send call
 * (action tools or cron integrations) and resolves true on success.
 */
export async function sendTutorDigest(
  read: Reader,
  tutorId: string,
  now: Date,
  appName: string,
  send: (mail: { to: string } & DigestEmail) => Promise<boolean>,
): Promise<DigestOutcome> {
  const user = (await read('users', { recordId: tutorId }, 1))[0]
  const email = user?.data.email
  if (typeof email !== 'string' || !email.includes('@')) return 'no_email'
  const mail = await buildTutorDigest(read, tutorId, now, appName)
  if (!mail) return 'empty'
  if (isTestAccountEmail(email)) return 'test_account'
  return (await send({ to: email, ...mail })) ? 'sent' : 'failed'
}
