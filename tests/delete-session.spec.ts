/**
 * A tutor deletes an ended session: everything it owns goes, including the
 * student's working image in the student's own folder. A live session can't
 * be deleted, and nobody else can delete it. Every answer is correct: no AI.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('a tutor deletes an ended session and everything in it', async ({ users }) => {
  test.setTimeout(150_000)
  const [tutor, student] = await users(2)
  const tok = async (u: MultiplayerUser) => {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
    return ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  }
  const [tt, st] = [await tok(tutor), await tok(student)]
  const post = async (u: MultiplayerUser, t: string, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${t}` }, data })).json()) as Record<string, any>
  const query = async (collection: string, where: Record<string, unknown>) => {
    const r = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_query', { input: { collection, where } })
    return (r.result?.data?.records ?? r.result?.records ?? []) as unknown[]
  }
  const create = async (collection: string, data: Record<string, unknown>) => {
    const r = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_create', { input: { collection, data } })
    return (r.result.data?.recordId ?? r.result.recordId) as string
  }
  const title = `__test-${Date.now()}__ delete me`
  const sessionId = await create('sessions', { title })
  const problemId = await create('problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}x^3' })
  await create('answerKeys', { problemId, answer: '3x^2' })
  try {
    const opened = await post(tutor, tt, '/api/actions/openSession', { sessionId })
    expect((await post(student, st, '/api/actions/joinSession', { joinCode: opened.data.joinCode })).success).toBe(true)

    // The student writes on the pad and submits (correct, so no AI call).
    const page = student.page
    await page.goto(`/sessions/${sessionId}`)
    const canvas = page.getByTestId('work-canvas')
    await expect(canvas).toBeVisible({ timeout: 20_000 })
    await canvas.scrollIntoViewIfNeeded()
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + 40, box.y + 40)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 90, { steps: 6 })
    await page.mouse.up()
    await page.getByTestId('answer-input').fill('3*x^2')
    await page.getByTestId('submit-answer').click()
    await expect(page.getByTestId('submit-status')).toHaveText(/Submitted/, { timeout: 15_000 })
    const subs = (await query('submissions', { sessionId })) as Array<{ recordId: string; data: { workKey: string } }>
    expect(subs[0].data.workKey).toBeTruthy() // the working image was saved

    // Not while it's live, and never by a student.
    expect(await post(tutor, tt, '/api/actions/deleteSession', { sessionId })).toMatchObject({ success: false, error: 'End the session before deleting it' })
    expect((await post(student, st, '/api/actions/deleteSession', { sessionId })).success).toBe(false)

    // End it, then delete. The action reports the student's working image as deleted.
    expect((await post(tutor, tt, '/api/actions/closeSession', { sessionId })).success).toBe(true)
    const deleted = await post(tutor, tt, '/api/actions/deleteSession', { sessionId })
    expect(deleted.success).toBe(true)
    expect(deleted.data.files).toBe(1)

    // Everything is gone, including the student's working image.
    for (const [collection, where] of [
      ['sessions', { recordId: sessionId }],
      ['problems', { sessionId }],
      ['answerKeys', { problemId }],
      ['submissions', { sessionId }],
    ] as const) expect(await query(collection, where), collection).toHaveLength(0)
    // The student's link to the working is gone with the session.
    expect((await student.context.request.get(`/api/submissions/${subs[0].recordId}/work`, { headers: { Authorization: `Bearer ${st}` } })).status()).toBe(404)
    await page.goto(`/sessions/${sessionId}`)
    await expect(page.getByText('Session not found')).toBeVisible({ timeout: 20_000 })

    // The button: a draft session, deleted from its page, sends the tutor home without it.
    const draftTitle = `__test-${Date.now()}__ draft to delete`
    const draftId = await create('sessions', { title: draftTitle })
    await tutor.page.goto(`/sessions/${draftId}`)
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByTestId('delete-session').click()
    await tutor.page.waitForURL(/\/home/, { timeout: 20_000 })
    await expect(tutor.page.getByText(draftTitle)).toHaveCount(0)
    expect(await query('sessions', { recordId: draftId })).toHaveLength(0)
  } finally {
    await post(tutor, tt, '/api/actions/cleanupTestSession', { sessionId })
  }
})
