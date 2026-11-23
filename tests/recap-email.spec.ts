/**
 * Recap emails, opt-in. A ticks "Email me a recap", B doesn't; the tutor ends
 * the session and sends. Test accounts are never really emailed (the action
 * marks them `test_account`), and every answer is correct, so this spends no
 * AI or email credits. Also checks that nobody can read or forge another
 * student's opt-in, and that only the session's tutor can send.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('students opt in; the tutor sends each one their own recap once', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, a, b] = await users(3)
  const tok = async (u: MultiplayerUser) => ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>
  const rows = async (u: MultiplayerUser, sessionId: string) => {
    const r = await post(u, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'recapRequests', where: { sessionId } } })
    return (r.result?.data?.records ?? r.result?.records ?? []) as Array<{ data: { studentId: string; wantsEmail: number; sentAt: string; delivery: string } }>
  }

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Recap email`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  const sessionId = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
  try {
    await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}x^3')
    await tutor.page.locator('#new-answer').fill('3x^2')
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })
    await tutor.page.getByTestId('open-session').click()
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
    for (const s of [a, b]) {
      await s.page.goto('/home')
      await s.page.getByTestId('join-code-input').fill(code)
      await s.page.getByTestId('join-submit').click()
      await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    }

    // A opts in (off by default) and answers; B does neither.
    await expect(a.page.getByTestId('recap-opt-in')).not.toBeChecked()
    await a.page.getByTestId('recap-opt-in').check()
    await expect(a.page.getByTestId('recap-opt-in')).toBeChecked({ timeout: 15_000 })
    await a.page.getByTestId('answer-input').fill('3*x^2')
    await a.page.getByTestId('submit-answer').click()
    await expect(a.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })

    // Privacy: B can't see A's opt-in, can't write rows directly, can't send, can't opt in to a session they aren't in.
    expect(await rows(b, sessionId)).toHaveLength(0)
    expect(await rows(a, sessionId)).toHaveLength(1)
    const forged = await post(b, '/_deepspace/agent/browser/tools/records_create', { input: { collection: 'recapRequests', data: { sessionId, studentId: 'someone', wantsEmail: 1 } } })
    expect(JSON.stringify(forged)).not.toMatch(/"success":\s*true/)
    expect((await post(b, '/api/actions/sendRecaps', { sessionId })).success).toBe(false)
    expect((await post(b, '/api/actions/setRecapEmail', { sessionId: 'not-a-session', wantsEmail: true })).success).toBe(false)
    expect((await post(a, '/api/actions/setRecapEmail', { sessionId, wantsEmail: 'yes' })).success).toBe(false)
    // The tutor can't send while the session is still running.
    expect((await post(tutor, '/api/actions/sendRecaps', { sessionId })).success).toBe(false)

    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    await expect(tutor.page.getByTestId('recap-count')).toContainText('1 student asked', { timeout: 15_000 })
    await tutor.page.getByTestId('send-recaps').click()
    await expect(tutor.page.getByTestId('recap-result')).toHaveText('1 test account skipped', { timeout: 30_000 })
    await expect(tutor.page.getByTestId('send-recaps')).toHaveCount(0, { timeout: 15_000 }) // nobody left to email
    await expect(a.page.getByTestId('recap-sent')).toContainText('test account', { timeout: 15_000 })
    await expect(b.page.getByTestId('recap-opt-in')).not.toBeChecked()

    const [row] = await rows(tutor, sessionId)
    expect(row.data.delivery).toBe('test_account')
    expect(row.data.sentAt).not.toBe('')
    // A second send emails nobody twice.
    expect((await post(tutor, '/api/actions/sendRecaps', { sessionId })).data).toEqual({ sent: 0, testAccounts: 0, failed: 0 })
  } finally {
    await post(tutor, '/api/actions/testCleanupPrivacyFixture', { sessionId })
  }
})
