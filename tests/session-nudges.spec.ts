/**
 * Small things during a session: the tutor's countdown (students see it too),
 * "N of M answered" on the board and "Waiting on …" on the roster, a saved
 * answer that reads as saved (no greyed-out button), the pad tips folded on
 * a phone, and a student leaving (and rejoining) a session. Correct answers
 * only, so no AI is spent.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('timer, who is left, saved state, pad tips, leaving', async ({ users }) => {
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

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Nudges`)
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
    await a.page.setViewportSize({ width: 390, height: 844 })
    for (const s of [a, b]) {
      await s.page.goto('/home')
      await s.page.getByTestId('join-code-input').fill(code)
      await s.page.getByTestId('join-submit').click()
      await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    }
    await expect(tutor.page.getByTestId('answered-of')).toHaveText('0 of 2 answered', { timeout: 15_000 })

    // Pad tips fold behind a toggle on a phone.
    const tips = a.page.getByTestId('work-pad-tips')
    await expect(tips).toBeVisible()
    await expect(tips.getByText(/Zoom with \+ and −/)).toBeHidden()
    await tips.locator('summary').click()
    await expect(tips.getByText(/Zoom with \+ and −/)).toBeVisible()

    // Timer: the tutor starts 1 minute; both see it count down; Stop clears it for everyone.
    await tutor.page.getByTestId('timer-1').click()
    await expect(tutor.page.getByTestId('problem-timer')).toHaveText(/0:5\d left|1:00 left/, { timeout: 15_000 })
    await expect(a.page.getByTestId('problem-timer')).toHaveText(/0:\d\d left|1:00 left/, { timeout: 15_000 })
    await a.page.getByTestId('problem-timer').scrollIntoViewIfNeeded()
    await a.page.screenshot({ path: 'test-results/student-timer.png' })
    await tutor.page.getByTestId('problem-timer').scrollIntoViewIfNeeded()
    await tutor.page.screenshot({ path: 'test-results/tutor-timer.png' })
    await tutor.page.getByTestId('timer-stop').click()
    await expect(a.page.getByTestId('problem-timer')).toHaveCount(0, { timeout: 15_000 })

    // A answers: the board counts it, the roster names who's left, and A's button gives way to a saved note.
    await a.page.getByTestId('answer-input').fill('3x^2')
    await a.page.getByTestId('submit-answer').click()
    await expect(a.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    await expect(a.page.getByTestId('submit-answer')).toHaveCount(0)
    await expect(a.page.getByTestId('saved-hint')).toBeVisible()
    await a.page.getByTestId('answer-input').fill('3*x^2')
    await expect(a.page.getByTestId('submit-answer')).toHaveText('Update answer')
    await a.page.getByTestId('answer-input').fill('3x^2')
    await expect(a.page.getByTestId('submit-answer')).toHaveCount(0)
    await expect(tutor.page.getByTestId('answered-of')).toHaveText('1 of 2 answered', { timeout: 15_000 })
    // Names only the one student still to answer (B): the roster row for B carries the same name.
    await expect(tutor.page.getByTestId('roster-waiting')).toBeVisible({ timeout: 15_000 })
    const bRowName = await tutor.page.locator(`[data-testid="roster-row"][data-student-id="${await userIdOf(b)}"]`).getByTestId('roster-name').textContent()
    await expect(tutor.page.getByTestId('roster-waiting')).toHaveText(`Waiting on ${bRowName} for P1`)

    // B leaves: off the roster and their list; they can rejoin with the code while it's live.
    b.page.once('dialog', (d) => d.accept())
    await b.page.getByTestId('leave-session').click()
    await b.page.waitForURL(/\/home$/, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('roster-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('roster-waiting')).toHaveCount(0)
    await expect(b.page.getByTestId('sessions-joined').getByText('Nudges')).toHaveCount(0)
    expect((await post(b, '/api/actions/joinSession', { joinCode: code })).success).toBe(true)
    await expect(tutor.page.getByTestId('roster-row')).toHaveCount(2, { timeout: 15_000 })
    // Only participants can leave.
    expect((await post(tutor, '/api/actions/leaveSession', { sessionId })).success).toBe(false)

    // A timer left running when the session ends doesn't come back on reopen.
    await tutor.page.getByTestId('timer-1').click()
    await expect(a.page.getByTestId('problem-timer')).toBeVisible({ timeout: 15_000 })
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByTestId('reopen-session').click()
    await expect(a.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    await expect(a.page.getByTestId('problem-timer')).toHaveCount(0)

    // Ended: A can take it off their list.
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    await expect(a.page.getByTestId('my-results')).toBeVisible({ timeout: 20_000 })
    a.page.once('dialog', (d) => d.accept())
    await a.page.getByTestId('leave-session').click()
    await a.page.waitForURL(/\/home$/, { timeout: 15_000 })
    await expect(a.page.getByTestId('sessions-joined').getByText('Nudges')).toHaveCount(0)
  } finally {
    await post(tutor, '/api/actions/cleanupTestSession', { sessionId })
  }
})
