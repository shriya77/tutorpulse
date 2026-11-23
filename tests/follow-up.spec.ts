/**
 * Follow-up check, end to end (spends two small AI calls: one grouping, one draft):
 *   RUN_AI_TESTS=1 npx deepspace test run tests/follow-up.spec.ts
 *
 * Student A gets the problem wrong, student B gets it right. The tutor opens
 * A's misconception group, has the AI draft a follow-up and sends it. Then:
 *  - only A sees the quick check; B sees nothing and cannot answer it;
 *  - B's followUps query returns nothing; A's returns only A's row;
 *  - A answers it and the tutor's card shows "1 of 1 now get it right".
 * Screenshots: test-results/follow-up-tutor.png, follow-up-student.png.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(process.env.RUN_AI_TESTS !== '1', 'Set RUN_AI_TESTS=1 (spends two small AI calls).')
test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('a follow-up check reaches only the misconception group', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, a, b] = await users(3)
  await a.page.setViewportSize({ width: 390, height: 844 })
  const tokens = new Map<MultiplayerUser, string>()
  for (const u of [tutor, a, b]) {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
    tokens.set(u, ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token)
  }
  const auth = (u: MultiplayerUser) => ({ Authorization: `Bearer ${tokens.get(u)}` })
  const action = async (u: MultiplayerUser, name: string, data: Record<string, unknown>) =>
    (await (await u.context.request.post(`/api/actions/${name}`, { headers: auth(u), data })).json()) as {
      success: boolean
      data?: Record<string, string>
      error?: string
    }
  const tool = async <T>(u: MultiplayerUser, name: string, input: Record<string, unknown>) => {
    const body = (await (await u.context.request.post(`/_deepspace/agent/browser/tools/${name}`, { headers: auth(u), data: { input } })).json()) as {
      result?: { data?: T } & T
    }
    return (body.result?.data ?? body.result) as T
  }
  const create = async (collection: string, data: Record<string, unknown>) =>
    (await tool<{ recordId: string }>(tutor, 'records_create', { collection, data })).recordId

  const sessionId = await create('sessions', { title: `__test-${Date.now()}__ follow-up` })
  const problemId = await create('problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}\\sin(3x^2)' })
  await create('answerKeys', { problemId, answer: '6x*cos(3x^2)', expectedMistakes: 'Forgetting the inner derivative' })
  try {
    const opened = await action(tutor, 'openSession', { sessionId })
    for (const s of [a, b]) expect((await action(s, 'joinSession', { joinCode: opened.data!.joinCode })).success).toBe(true)
    expect((await action(a, 'submitAnswer', { problemId, answer: 'cos(3x^2)', explanation: 'derivative of sin is cos' })).success).toBe(true)
    expect((await action(b, 'submitAnswer', { problemId, answer: '6x*cos(3x^2)' })).success).toBe(true)

    // ── Tutor drafts and sends a follow-up to A's group ─────────────────────
    const tp = tutor.page
    await tp.goto(`/sessions/${sessionId}`)
    await expect(tp.getByTestId('cluster-count').first()).toHaveText('1', { timeout: 90_000 })
    await tp.getByTestId('follow-up-open').first().click()
    await tp.getByTestId('follow-up-draft').click()
    await expect(tp.getByTestId('follow-up-preview')).toBeVisible({ timeout: 45_000 })
    await expect(tp.getByTestId('follow-up-send')).toHaveText('Send to 1 student')
    const key = await tp.getByTestId('follow-up-answer').inputValue()
    console.log('[follow-up] key status:', await tp.getByTestId('follow-up-key-status').textContent(), '| key:', key)
    await tp.getByTestId('follow-up-send').click()
    const card = tp.getByTestId('follow-up-problem')
    await expect(card).toContainText('sent to 1 student', { timeout: 20_000 })

    const fu = await tool<{ records: Array<{ recordId: string; data: { followUp?: number } }> }>(tutor, 'records_query', {
      collection: 'problems', where: { sessionId },
    })
    const followUpId = fu.records.find((r) => r.data.followUp === 1)!.recordId

    // ── Only A gets it ──────────────────────────────────────────────────────
    const rowsA = await tool<{ records: Array<{ data: { studentId: string; label: string } }> }>(a, 'records_query', { collection: 'followUps', where: { sessionId } })
    const rowsB = await tool<{ records: unknown[] }>(b, 'records_query', { collection: 'followUps', where: { sessionId } })
    expect(rowsA.records).toHaveLength(1)
    expect(rowsB.records ?? []).toHaveLength(0)
    expect(await action(b, 'submitAnswer', { problemId: followUpId, answer: key })).toEqual({ success: false, error: 'Problem not found' })

    await b.page.goto(`/sessions/${sessionId}`)
    await expect(b.page.getByTestId('answer-card')).toBeVisible({ timeout: 20_000 })
    await expect(b.page.getByTestId('follow-up-card')).toHaveCount(0)

    const ap = a.page
    await ap.goto(`/sessions/${sessionId}`)
    const quick = ap.getByTestId('follow-up-card')
    await expect(quick).toContainText('Quick check from your tutor', { timeout: 20_000 })
    await quick.getByTestId('answer-input').fill(key)
    await quick.getByTestId('submit-answer').click()
    await expect(quick.getByTestId('submit-status')).toContainText('Submitted', { timeout: 20_000 })
    await ap.screenshot({ path: 'test-results/follow-up-student.png', fullPage: true })

    await expect(tp.getByTestId('follow-up-result')).toContainText('1 of 1 now get it right', { timeout: 20_000 })
    await card.scrollIntoViewIfNeeded()
    await tp.screenshot({ path: 'test-results/follow-up-tutor.png', fullPage: true })
  } finally {
    await action(tutor, 'testCleanupPrivacyFixture', { sessionId, problemId })
  }
})
