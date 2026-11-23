/**
 * Tutor polish: answer keys read as maths in the editor; the board doesn't
 * say "nobody's here" twice; on a phone, End session sits below the board,
 * away from the join code; an ended session can be reopened with the same
 * code. Every answer is correct, so no AI is spent.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('key preview, one student count, End session on phones, reopen', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, s] = await users(2)
  const tok = async (u: MultiplayerUser) => ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>

  await tutor.page.setViewportSize({ width: 390, height: 844 })
  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Tutor board`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  const sessionId = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
  try {
    // The key previews as maths while typing, and shows as maths once saved.
    await tutor.page.locator('#new-prompt').fill('Where is $\\frac{1}{(x-2)(x-3)}$ positive?')
    await tutor.page.locator('#new-answer').fill('(-inf, 2) U (3, inf)')
    await expect(tutor.page.getByTestId('answer-preview')).toContainText('∞', { timeout: 15_000 })
    await expect(tutor.page.getByTestId('answer-preview')).toContainText('∪')
    await tutor.page.getByTestId('add-problem').click()
    await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}\\sqrt{x}')
    await tutor.page.locator('#new-answer').fill('1/(2*sqrt(x))')
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(2, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('answer-key-math')).toHaveCount(2, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('answer-key-math').nth(1).locator('.katex')).toHaveCount(1)
    await expect(tutor.page.getByTestId('answer-key-math').nth(1)).toHaveAttribute('title', 'Typed as 1/(2*sqrt(x))')
    await tutor.page.locator('#new-answer').fill('x = -1, ±sqrt(2)')
    await tutor.page.getByTestId('problem-row').first().scrollIntoViewIfNeeded()
    await tutor.page.screenshot({ path: 'test-results/editor-keys.png', fullPage: true })
    await tutor.page.locator('#new-answer').fill('')

    await tutor.page.getByTestId('open-session').click()
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
    // Nobody yet: the roster says so once; no "0 students joined", no "(0 online)".
    await expect(tutor.page.getByTestId('roster')).toContainText('No one has joined yet')
    await expect(tutor.page.getByTestId('joined-count')).toHaveCount(0)
    await expect(tutor.page.getByTestId('roster').getByRole('heading')).toHaveText('Students')

    // On a phone, the one visible End button is below the board, not next to the code.
    const end = tutor.page.getByRole('button', { name: 'End session' })
    await expect(end).toHaveCount(1)
    const endY = (await end.boundingBox({ timeout: 5_000 }))?.y ?? 0
    const codeY = (await tutor.page.getByTestId('join-code').boundingBox())!.y
    const lastProblemY = (await tutor.page.getByTestId('board-problem').last().boundingBox())!.y
    expect(endY).toBeGreaterThan(lastProblemY)
    expect(endY - codeY).toBeGreaterThan(600)
    await tutor.page.screenshot({ path: 'test-results/phone-board.png', fullPage: true })

    await s.page.goto('/home')
    await s.page.getByTestId('join-code-input').fill(code)
    await s.page.getByTestId('join-submit').click()
    await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    await expect(tutor.page.getByTestId('joined-count')).toHaveText('1 student joined', { timeout: 15_000 })
    await expect(tutor.page.getByTestId('roster').getByRole('heading')).toHaveText(/Students \(\d online\)/)

    tutor.page.once('dialog', (d) => d.accept())
    await end.click()
    await expect(tutor.page.getByTestId('reopen-session')).toBeVisible({ timeout: 15_000 })
    await expect(s.page.getByText('This session has ended.')).toBeVisible({ timeout: 15_000 })

    // Only the tutor can reopen, only an ended session.
    expect((await post(s, '/api/actions/reopenSession', { sessionId })).success).toBe(false)
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByTestId('reopen-session').click()
    await expect(tutor.page.getByTestId('join-code')).toHaveText(code, { timeout: 15_000 }) // same code
    expect((await post(tutor, '/api/actions/reopenSession', { sessionId })).success).toBe(false) // already open

    // The student carries on where they were.
    await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    await s.page.getByTestId('answer-input').fill('(-inf,2) U (3,inf)')
    await s.page.getByTestId('submit-answer').click()
    await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('stat-correct').first()).toContainText('1', { timeout: 15_000 })
  } finally {
    await post(tutor, '/api/actions/cleanupTestSession', { sessionId })
  }
})
