/**
 * Most common wrong answers on the board, the printable session report
 * (tutor only), and reusing a past problem from the problem bank. Two
 * students give the same wrong answer, which starts one small clustering
 * call (AI-billed, a fraction of a cent).
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('common wrong answers, session report, problem bank', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, a, b] = await users(3)
  const tokens = new Map<MultiplayerUser, string>()
  const tok = async (u: MultiplayerUser) => {
    if (!tokens.has(u)) tokens.set(u, ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token)
    return tokens.get(u)!
  }
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>
  const stamp = Date.now()
  const made: string[] = []

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${stamp}__ Report`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  const first = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
  made.push(first)
  try {
    const prompt = `\\frac{d}{dx}x^{${(stamp % 7) + 3}}` // unique enough to find in the bank later
    const n = (stamp % 7) + 3
    await tutor.page.locator('#new-prompt').fill(prompt)
    await tutor.page.locator('#new-answer').fill(`${n}x^${n - 1}`)
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })
    await tutor.page.getByTestId('open-session').click()
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
    for (const [s, ans] of [[a, `x^${n - 1}`], [b, ` X^${n - 1} `]] as const) {
      await s.page.goto('/home')
      await s.page.getByTestId('join-code-input').fill(code)
      await s.page.getByTestId('join-submit').click()
      await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
      await s.page.getByTestId('answer-input').fill(ans)
      await s.page.getByTestId('submit-answer').click()
      await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    }

    // The same wrong answer (spacing and case aside) is listed once, ×2.
    await expect(tutor.page.getByTestId('common-wrong-answer')).toHaveCount(1, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('common-wrong-answer')).toContainText('×2')

    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    await expect(tutor.page.getByTestId('reopen-session')).toBeVisible({ timeout: 15_000 })

    // The report: problems with counts, every student, a print button; tutor only.
    await tutor.page.getByTestId('report-link').click()
    await tutor.page.waitForURL(/\/report\//, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('report-problem')).toHaveCount(1, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('report-problem-stats')).toHaveText('2 answered · 0 right · 2 not yet')
    await expect(tutor.page.getByTestId('report-student')).toHaveCount(2, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('report-student').first().locator('td').first()).not.toHaveText('Student', { timeout: 15_000 }) // real names, not the placeholder
    await expect(tutor.page.getByTestId('print-report')).toBeVisible()
    await tutor.page.screenshot({ path: 'test-results/session-report.png', fullPage: true })
    await a.page.goto(`/report/${first}`)
    await expect(a.page.getByText('Report not found')).toBeVisible({ timeout: 15_000 })
    await expect(a.page.getByTestId('report-student')).toHaveCount(0)

    // The bank: a new draft can reuse that problem, key included.
    await tutor.page.goto('/home')
    await tutor.page.getByTestId('new-session-title').fill(`__test-${stamp}__ Reuse`)
    await tutor.page.getByTestId('new-session-submit').click()
    await tutor.page.waitForURL((u) => /\/sessions\//.test(u.pathname) && !u.pathname.endsWith(first), { timeout: 20_000 })
    made.push(tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0])
    await tutor.page.getByTestId('problem-bank-toggle').click()
    await tutor.page.getByTestId('problem-bank-search').fill(`__test-${stamp}__`)
    const row = tutor.page.getByTestId('problem-bank-row')
    await expect(row).toHaveCount(1, { timeout: 15_000 })
    await row.getByTestId('problem-bank-add').click()
    await expect(row.getByTestId('problem-bank-add')).toHaveText('Added', { timeout: 15_000 })
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('problem-row').getByTestId('answer-key-math')).toHaveAttribute('title', `Typed as ${n}x^${n - 1}`)
  } finally {
    for (const id of made) await post(tutor, '/api/actions/cleanupTestSession', { sessionId: id })
  }
})
