/**
 * Display name in Settings: a student renames themselves; the nav and the
 * tutor's roster use it; bad names are refused; only the session's tutor can
 * read students' names, nobody can write the table directly; "use my account
 * name" goes back. No AI. The test resets the name at the end.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

test('a display name set in Settings shows in the app and on the tutor roster', async ({ users }) => {
  test.setTimeout(150_000)
  const [tutor, a, b] = await users(3)
  const tok = async (u: MultiplayerUser) => {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
    return ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  }
  const [tt, at, bt] = [await tok(tutor), await tok(a), await tok(b)]
  const post = async (u: MultiplayerUser, t: string, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${t}` }, data })).json()) as Record<string, any>
  const rows = async (u: MultiplayerUser, t: string) => {
    const r = await post(u, t, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'displayNames' } })
    return (r.result?.data?.records ?? r.result?.records ?? []) as Array<{ data: { userId: string; name: string } }>
  }
  const create = async (collection: string, data: Record<string, unknown>) => {
    const r = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_create', { input: { collection, data } })
    return (r.result.data?.recordId ?? r.result.recordId) as string
  }
  const sessionId = await create('sessions', { title: `__test-${Date.now()}__ names` })
  const problemId = await create('problems', { sessionId, order: 1, prompt: 'x' })
  await create('answerKeys', { problemId, answer: 'x' })
  const NAME = 'Maya the Great'
  try {
    const opened = await post(tutor, tt, '/api/actions/openSession', { sessionId })
    for (const [u, t] of [[a, at], [b, bt]] as const) expect((await post(u, t, '/api/actions/joinSession', { joinCode: opened.data.joinCode })).success).toBe(true)

    // A renames themselves in Settings (messy spacing and an invisible character get tidied).
    const page = a.page
    await page.goto('/settings')
    const input = page.getByTestId('display-name-input')
    await input.fill('!!!')
    await page.getByTestId('display-name-save').click()
    await expect(page.getByTestId('display-name-status')).toHaveText('Use at least one letter or number')
    await input.fill('  Maya   the​ Great ')
    await page.getByTestId('display-name-save').click()
    await expect(page.getByTestId('display-name-status')).toContainText('Saved')
    await expect(page.getByTestId('display-name-shown')).toHaveText(NAME)
    await expect(page.getByTestId('nav-user-name')).toHaveText(NAME)
    expect((await post(a, at, '/api/actions/setDisplayName', { name: 'x'.repeat(41) })).success).toBe(false)

    // The tutor's roster shows it.
    await tutor.page.goto(`/sessions/${sessionId}`)
    await expect(tutor.page.getByTestId('roster-name').filter({ hasText: NAME })).toHaveCount(1, { timeout: 20_000 })

    // Privacy: the table is readable only by its owner; names reach the tutor only for their own session.
    expect((await rows(a, at)).map((r) => r.data.name)).toEqual([NAME])
    expect(await rows(b, bt)).toHaveLength(0)
    expect(await rows(tutor, tt)).toHaveLength(0)
    expect((await post(b, bt, '/api/actions/sessionDisplayNames', { sessionId })).success).toBe(false)
    const tutorView = await post(tutor, tt, '/api/actions/sessionDisplayNames', { sessionId })
    expect(Object.values(tutorView.data.names)).toEqual([NAME])
    expect(JSON.stringify(tutorView)).not.toMatch(/@/) // no emails
    const forged = await post(b, bt, '/_deepspace/agent/browser/tools/records_create', { input: { collection: 'displayNames', data: { userId: 'someone', name: 'Tutor' } } })
    expect(JSON.stringify(forged)).not.toMatch(/"success":\s*true/)

    // Back to the account name.
    await page.getByTestId('display-name-reset').click()
    await expect(page.getByTestId('display-name-status')).toHaveText('Back to your account name.')
    await expect(page.getByTestId('nav-user-name')).not.toHaveText(NAME)
    expect(await rows(a, at)).toHaveLength(0)
  } finally {
    await post(a, at, '/api/actions/setDisplayName', { name: '' })
    await post(tutor, tt, '/api/actions/cleanupTestSession', { sessionId })
  }
})
