/**
 * T5 — server actions and app routes reject forged or out-of-turn calls.
 *
 * Setup uses only real, RBAC-enforced paths: the tutor creates the session,
 * problem and key through the record tools (as the browser would), then
 * opens the session with the real action. Student A joins; Student B never
 * does, so B plays the "stranger".
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

type Who = { token: string; api: APIRequestContext }

async function who(u: MultiplayerUser): Promise<Who> {
  await u.page.goto('/home')
  await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
  const { token } = (await (await u.context.request.post('/api/auth/token')).json()) as { token: string }
  return { token, api: u.context.request }
}

async function action(w: Who, name: string, data: Record<string, unknown>) {
  const res = await w.api.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${w.token}` }, data })
  return { status: res.status(), body: (await res.json()) as { success?: boolean; data?: Record<string, string>; error?: string } }
}

async function create(w: Who, collection: string, data: Record<string, unknown>): Promise<string> {
  const res = await w.api.post('/_deepspace/agent/browser/tools/records_create', {
    headers: { Authorization: `Bearer ${w.token}` },
    data: { input: { collection, data } },
  })
  const body = (await res.json()) as { ok: boolean; result?: { data?: { recordId?: string }; recordId?: string } }
  const id = body.result?.data?.recordId ?? body.result?.recordId
  expect(body.ok && id, JSON.stringify(body).slice(0, 300)).toBeTruthy()
  return id!
}

test('T5: forged and out-of-turn requests are refused', async ({ users }) => {
  test.setTimeout(90_000)
  const [tutorU, aU, bU] = await users(3)
  const [tutor, a, b] = await Promise.all([who(tutorU), who(aU), who(bU)])

  const sessionId = await create(tutor, 'sessions', { title: `__test-${Date.now()}__ T5` })
  const problemId = await create(tutor, 'problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}x^2' })
  await create(tutor, 'answerKeys', { problemId, answer: '2x' })

  try {
    // A draft session can't be joined; opening needs the tutor.
    expect((await action(a, 'openSession', { sessionId })).body).toEqual({ success: false, error: 'Session not found' })
    const opened = await action(tutor, 'openSession', { sessionId })
    expect(opened.body.success).toBe(true)
    const code = opened.body.data!.joinCode

    // Wrong / malformed codes get one generic error.
    for (const joinCode of ['AAAAAA', 'nope', '', 12345]) {
      expect((await action(a, 'joinSession', { joinCode })).body).toEqual({ success: false, error: 'No open session with that code' })
    }
    expect((await action(a, 'joinSession', { joinCode: code })).body.success).toBe(true)

    // A legitimate submission works.
    expect((await action(a, 'submitAnswer', { problemId, answer: '2x', explanation: 'power rule' })).body).toEqual({
      success: true,
      data: { revision: 1 },
    })

    // Non-participant (B never joined) is refused, with no hint the session exists.
    expect((await action(b, 'submitAnswer', { problemId, answer: '2x', explanation: '' })).body).toEqual({
      success: false,
      error: 'Session not found',
    })
    // The tutor can't submit either (tutors aren't participants).
    expect((await action(tutor, 'submitAnswer', { problemId, answer: '2x', explanation: '' })).body.success).toBe(false)
    // Unknown / malformed problem ids.
    expect((await action(a, 'submitAnswer', { problemId: 'nope', answer: '2x' })).body).toEqual({ success: false, error: 'Problem not found' })
    expect((await action(a, 'submitAnswer', { problemId: { $ne: '' }, answer: '2x' })).body.success).toBe(false)
    // Oversized input.
    expect((await action(a, 'submitAnswer', { problemId, answer: 'x'.repeat(201) })).body.success).toBe(false)

    // Non-tutors can't run tutor actions.
    expect((await action(a, 'closeSession', { sessionId })).body).toEqual({ success: false, error: 'Session not found' })
    expect((await action(b, 'refreshSessionNotes', { sessionId })).body.success).toBe(false)
    expect((await action(a, 'addSessionNotes', { sessionId, fileKey: 'x', mimeType: 'text/plain' })).body.success).toBe(false)

    // A student can't write server-owned session fields through the record tools.
    const forged = await a.api.post('/_deepspace/agent/browser/tools/records_update', {
      headers: { Authorization: `Bearer ${a.token}` },
      data: { input: { collection: 'sessions', recordId: sessionId, data: { participantIds: [] } } },
    })
    expect(forged.status()).toBe(422)
    expect(((await forged.json()) as { error?: string }).error).toContain('UPDATE DENIED')

    // Locked problem: the tutor locks it, then submissions are refused.
    const lock = await tutor.api.post('/_deepspace/agent/browser/tools/records_update', {
      headers: { Authorization: `Bearer ${tutor.token}` },
      data: { input: { collection: 'problems', recordId: problemId, data: { status: 'locked' } } },
    })
    expect(lock.ok()).toBeTruthy()
    expect((await action(a, 'submitAnswer', { problemId, answer: '3x', explanation: '' })).body).toEqual({
      success: false,
      error: 'This problem is locked',
    })

    // Presence room: members only (B never joined). The route answers before any WebSocket upgrade.
    const presence = (w: Who) => w.api.get(`/ws/presence/session:${sessionId}?token=${w.token}`)
    expect((await presence(b)).status()).toBe(403)
    expect((await a.api.get(`/ws/presence/session:${sessionId}`)).status()).toBe(401)
    expect((await a.api.get(`/ws/presence/anything-else?token=${a.token}`)).status()).toBe(404)

    // Practice-set download is not reachable by id-guessing.
    expect((await b.api.get('/api/practice-sets/does-not-exist/pdf', { headers: { Authorization: `Bearer ${b.token}` } })).status()).toBe(404)

    // No bearer token → 401 on actions.
    expect((await a.api.post('/api/actions/submitAnswer', { data: { problemId, answer: '2x' } })).status()).toBe(401)

    // After closing, nobody can submit or join.
    expect((await action(tutor, 'closeSession', { sessionId })).body.success).toBe(true)
    expect((await action(a, 'joinSession', { joinCode: code })).body.success).toBe(false)
  } finally {
    await tutor.api.post('/api/actions/testCleanupPrivacyFixture', {
      headers: { Authorization: `Bearer ${tutor.token}` },
      data: { sessionId, problemId },
    })
  }
})
