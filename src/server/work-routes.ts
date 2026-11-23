/**
 * GET /api/submissions/:id/work — streams a student's handwritten working.
 *
 * The PNG lives in the STUDENT's private folder, so this route is the only
 * way it leaves: the student who wrote it, or the session's tutor (stamped
 * into `tutorIds` by `submitAnswer` from verified identity). Everyone else,
 * other students included, gets 404 with no hint whether the row exists.
 */

import { workImageType } from '../lib/work'
import type { Hono } from 'hono'
import { appFiles } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import type { SubmissionData } from '../actions/types.js'
import { getRecord } from './owner-records.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

export function canViewWork(sub: SubmissionData, userId: string): boolean {
  if (!sub.workKey) return false
  if (sub.studentId === userId) return true
  return Array.isArray(sub.tutorIds) && sub.tutorIds.includes(userId)
}

export function registerWorkRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.get('/api/submissions/:id/work', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    const sub = (await getRecord<SubmissionData>(c.env, 'submissions', c.req.param('id')))?.data ?? null
    if (!sub || !canViewWork(sub, auth.userId)) return c.json({ error: 'Not found' }, 404)
    try {
      const file = await appFiles(c.env, { scope: 'self', userId: sub.studentId }).download(sub.workKey!)
      // Serve only what submitAnswer accepted: a PNG drawing or an EXIF-free JPEG photo.
      const bytes = new Uint8Array(await file.arrayBuffer())
      const type = workImageType(bytes)
      if (!type) return c.json({ error: 'Not found' }, 404)
      return new Response(bytes, {
        headers: {
          'Content-Type': type,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
        },
      })
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  })
}
