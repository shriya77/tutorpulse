/**
 * The tutor removes a student from a live session: they leave the roster and
 * the board's counts, lose access to the session, can't rejoin with the code,
 * and their answer is deleted. Only the tutor can do it. Correct answers
 * only, so no AI is spent.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('a tutor removes a student, who cannot rejoin', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, a, b] = await users(3)
  const tokens = new Map<MultiplayerUser, string>()
  const tok = async (u: MultiplayerUser) => {
    if (!tokens.has(u)) tokens.set(u, ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token)
    return tokens.get(u)!
  }
  const userIdOf = async (u: MultiplayerUser) => (JSON.parse(Buffer.from((await tok(u)).split('.')[1], 'base64url').toString()) as { sub: string }).sub
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>
  const problemsSeen = async (u: MultiplayerUser, sessionId: string) => {
    const r = await post(u, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'problems', where: { sessionId } } })
    return ((r.result?.data?.records ?? r.result?.records ?? []) as unknown[]).length
  }
  const mySubs = async (u: MultiplayerUser, sessionId: string) => {
    const r = await post(u, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'submissions', where: { sessionId } } })
    return (r.result?.data?.records ?? r.result?.records ?? []) as unknown[]
  }

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Remove student`)
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
    // Problems are only for the session's people: B can't read them before joining.
    expect(await problemsSeen(b, sessionId)).toBe(0)
    expect(await problemsSeen(tutor, sessionId)).toBe(1)
    for (const s of [a, b]) {
      await s.page.goto('/home')
      await s.page.getByTestId('join-code-input').fill(code)
      await s.page.getByTestId('join-submit').click()
      await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
      await s.page.getByTestId('answer-input').fill('3x^2')
      await s.page.getByTestId('submit-answer').click()
      await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    }
    await expect(tutor.page.getByTestId('roster-row')).toHaveCount(2, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('stat-submitted').first()).toContainText('2', { timeout: 15_000 })
    expect(await mySubs(b, sessionId)).toHaveLength(1)

    // Only the tutor can remove anyone.
    expect((await post(a, '/api/actions/removeStudent', { sessionId, studentId: 'anyone' })).success).toBe(false)

    // Remove B (the roster row whose name is B's).
    const bRow = tutor.page.locator(`[data-testid="roster-row"][data-student-id="${await userIdOf(b)}"]`)
    await expect(bRow).toHaveCount(1)
    tutor.page.once('dialog', (d) => d.accept())
    await bRow.getByTestId('roster-remove').click()
    await expect(tutor.page.getByTestId('roster-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('joined-count')).toHaveText('1 student joined')
    await expect(tutor.page.getByTestId('stat-submitted').first()).toContainText('1', { timeout: 15_000 })

    // B loses the session and their answer, and the code won't let them back in.
    await expect(b.page.getByText('Session not found')).toBeVisible({ timeout: 20_000 })
    expect(await mySubs(b, sessionId)).toHaveLength(0)
    expect(await post(b, '/api/actions/joinSession', { joinCode: code })).toEqual({ success: false, error: 'Your tutor removed you from this session' })
    expect(await problemsSeen(b, sessionId)).toBe(0) // nor after being removed
    expect(await problemsSeen(a, sessionId)).toBe(1)
    // A is unaffected.
    expect(await mySubs(a, sessionId)).toHaveLength(1)
    await expect(a.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/)
  } finally {
    await post(tutor, '/api/actions/cleanupTestSession', { sessionId })
  }
})
