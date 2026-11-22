/**
 * T8: handwritten working stays between a student and their tutor.
 *
 * Student A draws on the real sketch pad and submits. Then:
 *  - the working route serves A's image to A and to the tutor, 404 to
 *    student B and 401 to a caller with no sign-in;
 *  - B cannot attach A's file to B's own submission (the action re-reads the
 *    key from B's own folder, where it does not exist);
 *  - B cannot attach a non-PNG from B's own folder;
 *  - B CAN attach a real PNG of their own (positive control).
 *
 * All answers are correct, so no clustering job runs and no AI credits are spent.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

type Who = { token: string; api: APIRequestContext; page: MultiplayerUser['page'] }

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function who(u: MultiplayerUser): Promise<Who> {
  await u.page.goto('/home')
  await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
  const { token } = (await (await u.context.request.post('/api/auth/token')).json()) as { token: string }
  return { token, api: u.context.request, page: u.page }
}

const bearer = (w: Who) => ({ Authorization: `Bearer ${w.token}` })

async function action(w: Who, name: string, data: Record<string, unknown>) {
  const res = await w.api.post(`/api/actions/${name}`, { headers: bearer(w), data })
  return (await res.json()) as { success?: boolean; data?: Record<string, string>; error?: string }
}

async function tool<T>(w: Who, name: string, input: Record<string, unknown>): Promise<T> {
  const res = await w.api.post(`/_deepspace/agent/browser/tools/${name}`, { headers: bearer(w), data: { input } })
  const body = (await res.json()) as { result?: { data?: T } & T }
  return (body.result?.data ?? body.result) as T
}

async function create(w: Who, collection: string, data: Record<string, unknown>): Promise<string> {
  const r = await tool<{ recordId?: string }>(w, 'records_create', { collection, data })
  expect(r?.recordId, `create ${collection}`).toBeTruthy()
  return r.recordId!
}

/** Upload bytes into the caller's OWN private folder, exactly as useR2Files does. */
async function uploadOwn(w: Who, key: string, bytes: Buffer, mimeType: string): Promise<string> {
  const res = await w.api.post(`/api/files/upload?scope=self&key=${encodeURIComponent(key)}`, {
    headers: bearer(w),
    multipart: { file: { name: 'working.png', mimeType, buffer: bytes } },
  })
  const body = (await res.json()) as { key?: string; success?: boolean; error?: string }
  expect(body.key, `upload: ${JSON.stringify(body)}`).toBeTruthy()
  return body.key!
}

test('T8: handwritten working is visible only to the student and their tutor', async ({ users, request }) => {
  test.setTimeout(120_000)
  const [tutorU, aU, bU] = await users(3)
  const [tutor, a, b] = await Promise.all([who(tutorU), who(aU), who(bU)])

  const sessionId = await create(tutor, 'sessions', { title: `__test-${Date.now()}__ T6 working` })
  const problemId = await create(tutor, 'problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}x^2' })
  await create(tutor, 'answerKeys', { problemId, answer: '2x' })

  try {
    const opened = await action(tutor, 'openSession', { sessionId })
    expect(opened.success).toBe(true)
    for (const s of [a, b]) expect((await action(s, 'joinSession', { joinCode: opened.data!.joinCode })).success).toBe(true)

    // ── A draws real working on the pad and submits through the UI ──────────
    await a.page.goto(`/sessions/${sessionId}`)
    const canvas = a.page.getByTestId('work-canvas')
    await expect(canvas).toBeVisible({ timeout: 20_000 })
    await canvas.scrollIntoViewIfNeeded() // mouse coordinates must be inside the viewport
    const box = (await canvas.boundingBox())!
    await a.page.mouse.move(box.x + 30, box.y + 40)
    await a.page.mouse.down()
    for (let i = 1; i <= 12; i++) await a.page.mouse.move(box.x + 30 + i * 15, box.y + 40 + (i % 2) * 20)
    await a.page.mouse.up()
    await a.page.getByTestId('answer-input').fill('2x')
    await a.page.getByTestId('submit-answer').click()
    await expect(a.page.getByTestId('submit-status')).toContainText('Submitted', { timeout: 20_000 })

    const subs = await tool<{ records: Array<{ recordId: string; data: { studentId: string; workKey?: string } }> }>(
      tutor, 'records_query', { collection: 'submissions', where: { problemId } },
    )
    expect(subs.records).toHaveLength(1)
    const aSub = subs.records[0]
    expect(aSub.data.workKey, 'the submission records the working').toBeTruthy()
    const url = `/api/submissions/${aSub.recordId}/work`

    // ── Who can see it ──────────────────────────────────────────────────────
    for (const [label, w] of [['tutor', tutor], ['student A', a]] as const) {
      const res = await w.api.get(url, { headers: bearer(w) })
      expect(res.status(), label).toBe(200)
      expect(res.headers()['content-type']).toBe('image/png')
      expect((await res.body()).subarray(0, 4).toString('hex')).toBe('89504e47')
    }
    expect((await b.api.get(url, { headers: bearer(b) })).status(), 'student B').toBe(404)
    expect((await request.get(url)).status(), 'no sign-in').toBe(401)

    // ── B cannot borrow A's file, or attach a non-image ─────────────────────
    expect(await action(b, 'submitAnswer', { problemId, answer: '2x', workKey: aSub.data.workKey })).toEqual({
      success: false,
      error: 'Could not read your working',
    })
    const textKey = await uploadOwn(b, `work/${problemId}.png`, Buffer.from('<svg onload=alert(1)>'), 'image/png')
    expect(await action(b, 'submitAnswer', { problemId, answer: '2x', workKey: textKey })).toEqual({
      success: false,
      error: 'Your working must be a drawing from the pad',
    })

    // ── Positive control: B's own PNG is accepted and shown to the tutor ───
    const pngKey = await uploadOwn(b, `work/${problemId}.png`, PNG_1PX, 'image/png')
    expect((await action(b, 'submitAnswer', { problemId, answer: '2x', workKey: pngKey })).success).toBe(true)
    const after = await tool<{ records: Array<{ recordId: string; data: { studentId: string; workKey?: string } }> }>(
      tutor, 'records_query', { collection: 'submissions', where: { problemId } },
    )
    const bSub = after.records.find((r) => r.recordId !== aSub.recordId)!
    expect((await tutor.api.get(`/api/submissions/${bSub.recordId}/work`, { headers: bearer(tutor) })).status()).toBe(200)
    expect((await a.api.get(`/api/submissions/${bSub.recordId}/work`, { headers: bearer(a) })).status(), 'A cannot see B').toBe(404)
  } finally {
    await action(tutor, 'testCleanupPrivacyFixture', { sessionId, problemId })
  }
})
