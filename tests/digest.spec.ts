/**
 * Weekly digest email. Off by default; the tutor turns it on in Settings
 * (kept across reloads). After a session, the preview builds the digest, a
 * test account is never really emailed, and a second preview is rate-limited. The weekly task itself is run through
 * the local-only `testRunWeeklyDigest` fixture (for the caller only), so this
 * spec runs locally: `npx deepspace test run tests/digest.spec.ts`.
 * Correct answers only, so no AI is spent; no email is sent.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('weekly digest: opt in, preview, weekly run', async ({ users, baseURL }) => {
  test.skip(/app\.space/.test(baseURL ?? ''), 'Uses a local-only fixture.')
  test.setTimeout(180_000)
  const [tutor, s] = await users(2)
  const tokens = new Map<MultiplayerUser, string>()
  const tok = async (u: MultiplayerUser) => {
    if (!tokens.has(u)) tokens.set(u, ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token)
    return tokens.get(u)!
  }
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>
  const myPref = async () => {
    const r = await post(tutor, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'digestPrefs' } })
    return ((r.result?.data?.records ?? r.result?.records ?? []) as Array<{ data: { weekly: number; lastOutcome: string; lastSentAt: string } }>)[0]
  }
  let sessionId = ''
  try {
    // Start clean: the preview limit (10 min) would otherwise carry over from a recent run.
    expect((await post(tutor, '/api/actions/testRunWeeklyDigest', { resetPreviewOnly: true })).success).toBe(true)

    // Off by default; turning it on sticks.
    await tutor.page.goto('/settings')
    const toggle = tutor.page.getByTestId('digest-toggle')
    await expect(toggle).toBeVisible({ timeout: 15_000 })
    if (await toggle.isChecked()) {
      await toggle.uncheck()
      await expect.poll(async () => (await myPref())?.data.weekly).toBe(0)
    }
    await toggle.check()
    await expect.poll(async () => (await myPref())?.data.weekly, { timeout: 15_000 }).toBe(1)
    await tutor.page.reload()
    await expect(tutor.page.getByTestId('digest-toggle')).toBeChecked({ timeout: 15_000 })

    // Nobody else can change it: a student's call only ever touches their own row.
    expect((await post(s, '/api/actions/setWeeklyDigest', { weekly: 'yes' })).success).toBe(false)

    // A session this week, so there's something to summarise.
    await tutor.page.goto('/home')
    await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Digest`)
    await tutor.page.getByTestId('new-session-submit').click()
    await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
    sessionId = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
    await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}x^3')
    await tutor.page.locator('#new-answer').fill('3x^2')
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })
    await tutor.page.getByTestId('open-session').click()
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
    expect((await post(s, '/api/actions/joinSession', { joinCode: code })).success).toBe(true)
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    await expect(tutor.page.getByTestId('reopen-session')).toBeVisible({ timeout: 15_000 })

    // Preview: built, but a test account is never emailed. Then rate-limited.
    await tutor.page.goto('/settings')
    await tutor.page.getByTestId('digest-preview').click()
    await expect(tutor.page.getByTestId('digest-note')).toHaveText(/test account/, { timeout: 30_000 })
    await tutor.page.getByTestId('digest-preview').click()
    await expect(tutor.page.getByTestId('digest-note')).toHaveText(/once every 10 minutes/, { timeout: 15_000 })

    // The weekly task, for this tutor: marked as this week's digest, not emailed.
    const run = await post(tutor, '/api/actions/testRunWeeklyDigest', {})
    expect(run.data?.tally).toEqual({ test_account: 1 })
    const pref = await myPref()
    expect(pref.data.lastOutcome).toBe('test_account')
    expect(Date.now() - Date.parse(pref.data.lastSentAt)).toBeLessThan(60_000)
    await tutor.page.reload()
    await expect(tutor.page.getByTestId('digest-last')).toBeVisible({ timeout: 15_000 })
  } finally {
    if (sessionId) await post(tutor, '/api/actions/cleanupTestSession', { sessionId })
    await post(tutor, '/api/actions/setWeeklyDigest', { weekly: false })
  }
})
