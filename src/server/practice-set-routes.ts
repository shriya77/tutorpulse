/**
 * GET /api/practice-sets/:id/pdf — streams a practice-set PDF (F16).
 *
 * The PDF lives in the tutor's private file folder, so this route is the one
 * place it can leave: the tutor may always download it; a student only once
 * `publishPracticeSet` has added them to the row and set it `published`.
 * Everyone else gets 404 (no hint whether the set exists).
 */

import type { Hono } from 'hono'
import { appFiles } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import type { PracticeSetData } from '../actions/types.js'
import { getRecord } from './owner-records.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

export function canDownloadPracticeSet(set: PracticeSetData, userId: string): boolean {
  if (!set.fileKey) return false
  if (set.tutorId === userId) return true
  const readers = Array.isArray(set.participantIds) ? set.participantIds : []
  return set.status === 'published' && readers.includes(userId)
}

export function registerPracticeSetRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.get('/api/practice-sets/:id/pdf', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    const set = (await getRecord<PracticeSetData>(c.env, 'practiceSets', c.req.param('id')))?.data ?? null
    if (!set || !canDownloadPracticeSet(set, auth.userId)) return c.json({ error: 'Not found' }, 404)
    const file = await appFiles(c.env, { scope: 'self', userId: set.tutorId }).download(set.fileKey!)
    return new Response(file.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="tutorpulse-practice-set.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}
