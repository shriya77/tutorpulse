/**
 * What a student sees: "Problem X of Y", the "Discussing" banner staying on
 * screen while they scroll down to the pad (and inside the full-screen pad),
 * and their own results once the session ends. Every answer is checked by
 * mathjs, so this spends no AI credits.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('progress, pinned banner, and each student sees only their own results after the end', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, a, b] = await users(3)
  const tok = async (u: MultiplayerUser) => ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Student screen`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  const sessionId = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
  try {
    for (const [prompt, key] of [['\\frac{d}{dx}x^3', '3x^2'], ['\\frac{d}{dx}\\sin(x)', 'cos(x)']]) {
      await tutor.page.locator('#new-prompt').fill(prompt)
      await tutor.page.locator('#new-answer').fill(key)
      await tutor.page.getByTestId('add-problem').click()
    }
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(2, { timeout: 15_000 })
    await tutor.page.getByTestId('open-session').click()
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
    for (const s of [a, b]) {
      await s.page.setViewportSize({ width: 390, height: 700 })
      await s.page.goto('/home')
      await s.page.getByTestId('join-code-input').fill(code)
      await s.page.getByTestId('join-submit').click()
      await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    }
    await expect(a.page.getByRole('heading', { name: 'Problem 1 of 2' })).toBeVisible()

    // Results are for after the session: not while it's live, and never for someone who didn't join.
    expect((await post(a, '/api/actions/myResults', { sessionId })).success).toBe(false)
    expect((await post(tutor, '/api/actions/myResults', { sessionId })).success).toBe(false)

    // A gets problem 1 right; B gets it wrong.
    await a.page.getByTestId('answer-input').fill('3*x^2')
    await a.page.getByTestId('submit-answer').click()
    await expect(a.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    await b.page.getByTestId('answer-input').fill('x^2')
    await b.page.getByTestId('submit-answer').click()
    await expect(b.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })

    // The tutor puts a topic up. A has scrolled down to the answer box: the banner stays in view.
    await a.page.getByTestId('answer-input').scrollIntoViewIfNeeded()
    const set = await post(tutor, '/_deepspace/agent/browser/tools/records_update', { input: { collection: 'sessions', recordId: sessionId, data: { focusLabel: 'Power rule exponent' } } })
    expect(JSON.stringify(set)).toMatch(/"success":\s*true/)
    const banner = a.page.getByTestId('focus-banner')
    await expect(banner).toContainText('Power rule exponent', { timeout: 15_000 })
    await a.page.locator('main').evaluate((m) => m.scrollTo(0, m.scrollHeight))
    await expect(banner).toBeInViewport()
    const box = (await banner.boundingBox())!
    const mainTop = (await a.page.locator('main').boundingBox())!.y
    expect(box.y).toBeGreaterThanOrEqual(mainTop) // pinned under the nav, not scrolled away
    expect(box.y).toBeLessThan(mainTop + 20)
    await a.page.screenshot({ path: 'test-results/student-banner.png' })
    // In the full-screen pad, where the page banner is hidden, the topic shows above the problem.
    await a.page.getByTestId('work-expand').click()
    await expect(a.page.getByTestId('fullscreen-focus')).toContainText('Power rule exponent')
    await a.page.keyboard.press('Escape')
    await expect(a.page.getByTestId('work-fullscreen')).toHaveCount(0)

    // Next problem: the count moves on. Nobody answers it.
    await tutor.page.getByTestId('board-problem').nth(1).getByRole('button', { name: 'Show to students' }).click()
    await expect(a.page.getByRole('heading', { name: 'Problem 2 of 2' })).toBeVisible({ timeout: 15_000 })

    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()

    // Each student sees their own results, and only theirs.
    for (const [s, right, status1, answer] of [[a, 1, 'correct', null], [b, 0, 'incorrect', 'x^2']] as const) {
      await expect(s.page.getByTestId('my-results')).toBeVisible({ timeout: 20_000 })
      await expect(s.page.getByTestId('my-results-summary')).toHaveText(`${right} of 2 right.`)
      const rows = s.page.getByTestId('my-result')
      await expect(rows).toHaveCount(2)
      await expect(rows.nth(0)).toHaveAttribute('data-status', status1)
      await expect(rows.nth(1)).toHaveAttribute('data-status', 'not_answered')
      if (answer) await expect(rows.nth(0)).toContainText(`Your answer: ${answer}`)
    }
    await b.page.screenshot({ path: 'test-results/student-results.png', fullPage: true })
    await expect(a.page.getByTestId('my-results')).not.toContainText('x^2') // B's answer never reaches A
    const mine = await post(b, '/api/actions/myResults', { sessionId })
    expect(mine.data.results.map((r: { status: string }) => r.status)).toEqual(['incorrect', 'not_answered'])
    expect(JSON.stringify(mine)).not.toMatch(/3\*x\^2|explanation|studentId/) // nothing about A, no AI explanation
    expect((await post(tutor, '/api/actions/myResults', { sessionId })).success).toBe(false)
  } finally {
    await post(tutor, '/api/actions/cleanupTestSession', { sessionId })
  }
})
