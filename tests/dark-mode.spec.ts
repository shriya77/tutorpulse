/**
 * Dark mode: follows the device by default, Settings can force Light or
 * Dark (kept across reloads), and the sketch pad stays light paper either
 * way. Screenshots of the main screens land in test-results/dark-*.png.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('dark mode follows the device, Settings overrides it, the pad stays paper', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, s] = await users(2)
  const tokens = new Map<MultiplayerUser, string>()
  const tok = async (u: MultiplayerUser) => {
    if (!tokens.has(u)) tokens.set(u, ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token)
    return tokens.get(u)!
  }
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>
  const theme = (u: MultiplayerUser) => u.page.evaluate(() => document.documentElement.getAttribute('data-theme'))

  await tutor.page.emulateMedia({ colorScheme: 'dark' })
  await s.page.emulateMedia({ colorScheme: 'dark' })

  // The static landing page too (first paint, before any app code).
  await tutor.page.goto('/')
  expect(await theme(tutor)).toBe('notebook-night')
  await tutor.page.screenshot({ path: 'test-results/dark-landing.png' })

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Dark mode`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  const sessionId = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
  try {
    expect(await theme(tutor)).toBe('notebook-night')
    await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}x^3')
    await tutor.page.locator('#new-answer').fill('3x^2')
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })
    await tutor.page.getByTestId('open-session').click()
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()

    await s.page.setViewportSize({ width: 390, height: 844 })
    await s.page.goto('/home')
    await s.page.screenshot({ path: 'test-results/dark-home.png', fullPage: true })
    await s.page.getByTestId('join-code-input').fill(code)
    await s.page.getByTestId('join-submit').click()
    await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    await s.page.getByTestId('answer-input').fill('3x^2')
    await s.page.getByTestId('submit-answer').click()
    await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    const set = await post(tutor, '/_deepspace/agent/browser/tools/records_update', { input: { collection: 'sessions', recordId: sessionId, data: { focusLabel: 'Power rule exponent' } } })
    expect(JSON.stringify(set)).toMatch(/"success":\s*true/)
    await expect(s.page.getByTestId('focus-banner')).toBeVisible({ timeout: 15_000 })
    await s.page.waitForTimeout(2000) // let the banner's glow finish
    await s.page.screenshot({ path: 'test-results/dark-student.png' })

    // The pad's paper stays light in dark mode.
    const paper = await s.page.locator('[data-testid="work-pad"] canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(Math.floor(c.width / 2) + 3, Math.floor(c.height / 2) + 3, 1, 1).data
      return [d[0], d[1], d[2]]
    })
    expect(Math.min(...paper)).toBeGreaterThan(200)

    await tutor.page.screenshot({ path: 'test-results/dark-tutor.png', fullPage: true })
    await tutor.page.getByTestId('problem-stats').first().scrollIntoViewIfNeeded()
    await tutor.page.screenshot({ path: 'test-results/dark-board.png' })

    // Settings: Light sticks over the device setting, across a reload; System follows the device again.
    await tutor.page.goto('/settings')
    await tutor.page.getByText('Light', { exact: true }).click()
    expect(await theme(tutor)).toBe('notebook')
    await tutor.page.reload()
    expect(await theme(tutor)).toBe('notebook')
    await tutor.page.getByText('Dark', { exact: true }).click()
    expect(await theme(tutor)).toBe('notebook-night')
    await tutor.page.screenshot({ path: 'test-results/dark-settings.png' })
    await tutor.page.emulateMedia({ colorScheme: 'light' })
    await tutor.page.reload()
    expect(await theme(tutor)).toBe('notebook-night') // still forced dark
    await tutor.page.getByText('System', { exact: true }).click()
    expect(await theme(tutor)).toBe('notebook') // the device is light now
    await tutor.page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => theme(tutor)).toBe('notebook-night') // and follows it live
  } finally {
    await post(tutor, '/api/actions/cleanupTestSession', { sessionId })
  }
})
