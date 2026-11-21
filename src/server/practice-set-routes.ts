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

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

async function loadPracticeSet(env: Env, id: string): Promise<PracticeSetData | null> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': env.OWNER_USER_ID, 'X-App-Action': 'true' },
      body: JSON.stringify({ tool: 'records.get', params: { collection: 'practiceSets', recordId: id } }),
    }),
  )
  const json = (await res.json()) as { success?: boolean; data?: { record?: { data?: PracticeSetData } } }
  return json.success ? (json.data?.record?.data ?? null) : null
}

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
    const set = await loadPracticeSet(c.env, c.req.param('id'))
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
