/**
 * A tutor manages their sessions: rename (students see it live), dates on the
 * home list, archive / unarchive, and duplicate (same problems and answer
 * keys, no students or answers). Every answer is correct, so no AI is spent.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('rename, archive, and duplicate a session', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, s] = await users(2)
  const tok = async (u: MultiplayerUser) => ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  const post = async (u: MultiplayerUser, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${await tok(u)}` }, data })).json()) as Record<string, any>
  const sessionRow = async (u: MultiplayerUser, id: string) => {
    const r = await post(u, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'sessions', limit: 500 } })
    const rows = (r.result?.data?.records ?? r.result?.records ?? []) as Array<{ recordId: string; data: { title: string; participantIds: string[]; status: string } }>
    return rows.find((x) => x.recordId === id)
  }
  const join = async (url: string) => {
    const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
    await s.page.goto('/home')
    await s.page.getByTestId('join-code-input').fill(code)
    await s.page.getByTestId('join-submit').click()
    await s.page.waitForURL(url, { timeout: 20_000 })
  }
  const stamp = Date.now()
  const ids: string[] = []

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${stamp}__ Manage`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  const original = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
  ids.push(original)
  try {
    for (const [prompt, key] of [['\\frac{d}{dx}x^3', '3x^2'], ['\\frac{d}{dx}e^{2x}', '2e^(2x)']]) {
      await tutor.page.locator('#new-prompt').fill(prompt)
      await tutor.page.locator('#new-answer').fill(key)
      await tutor.page.getByTestId('add-problem').click()
    }
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(2, { timeout: 15_000 })
    await tutor.page.getByTestId('open-session').click()
    await join(tutor.page.url())
    await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })

    // Rename while live: the student's page follows.
    await tutor.page.getByTestId('rename-session').click()
    await tutor.page.getByTestId('rename-input').fill(`__test-${stamp}__ Week 4 group A`)
    await tutor.page.getByTestId('rename-save').click()
    await expect(tutor.page.getByTestId('session-title')).toHaveText(`__test-${stamp}__ Week 4 group A`, { timeout: 15_000 })
    await expect(s.page.getByTestId('session-title')).toHaveText(`__test-${stamp}__ Week 4 group A`, { timeout: 15_000 })
    await expect(s.page.getByTestId('rename-session')).toHaveCount(0) // students can't rename

    await s.page.getByTestId('answer-input').fill('3x^2')
    await s.page.getByTestId('submit-answer').click()
    await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    await expect(tutor.page.getByTestId('archive-session')).toBeVisible({ timeout: 15_000 })

    // Only the tutor can copy it.
    expect((await post(s, '/api/actions/duplicateSession', { sessionId: original })).success).toBe(false)

    // Archive: it leaves the main list for "Archived", and comes back on Unarchive.
    await tutor.page.getByTestId('archive-session').click()
    await expect(tutor.page.getByTestId('archived-note')).toBeVisible({ timeout: 15_000 })
    await tutor.page.goto('/home')
    const named = (list: string) => tutor.page.getByTestId(list).getByTestId('session-row').filter({ hasText: `__test-${stamp}__` })
    await expect(named('sessions-archived')).toHaveCount(1, { timeout: 15_000 })
    await expect(named('sessions-run')).toHaveCount(0)
    // The student's own list isn't affected, and shows a date.
    await s.page.goto('/home')
    const theirs = s.page.getByTestId('sessions-joined').getByTestId('session-row').filter({ hasText: `__test-${stamp}__` })
    await expect(theirs).toHaveCount(1, { timeout: 15_000 })
    await expect(theirs.getByTestId('session-date')).not.toHaveText('')
    await tutor.page.getByTestId('archived-sessions').locator('summary').click()
    await tutor.page.getByTestId('archived-sessions').scrollIntoViewIfNeeded()
    await tutor.page.screenshot({ path: 'test-results/home-sessions.png' })
    await named('sessions-archived').click()
    await tutor.page.getByTestId('archive-session').click()
    await expect(tutor.page.getByTestId('archived-note')).toHaveCount(0, { timeout: 15_000 })
    await tutor.page.getByTestId('duplicate-session').scrollIntoViewIfNeeded()
    await tutor.page.screenshot({ path: 'test-results/manage-session.png' })

    // Duplicate: a new draft with both problems and keys, and nobody in it.
    await tutor.page.getByTestId('duplicate-session').click()
    await tutor.page.waitForURL((u) => !u.pathname.endsWith(original), { timeout: 20_000 })
    const copy = tutor.page.url().split('/sessions/')[1].split(/[?#]/)[0]
    ids.push(copy)
    await expect(tutor.page.getByTestId('session-title')).toHaveText(`__test-${stamp}__ Week 4 group A (copy)`, { timeout: 15_000 })
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(2, { timeout: 15_000 })
    const row = await sessionRow(tutor, copy)
    expect(row?.data.status).toBe('draft')
    expect(row?.data.participantIds ?? []).toEqual([])
    expect(await sessionRow(s, copy)).toBeUndefined() // the student isn't carried over

    // The copied keys work: a right answer to each problem counts as right.
    await tutor.page.getByTestId('open-session').click()
    await join(tutor.page.url())
    await s.page.getByTestId('answer-input').fill('3*x^2')
    await s.page.getByTestId('submit-answer').click()
    await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    tutor.page.once('dialog', (d) => d.accept())
    await tutor.page.getByRole('button', { name: 'End session' }).click()
    await expect(s.page.getByTestId('my-results-summary')).toHaveText('1 of 2 right.', { timeout: 20_000 })
  } finally {
    for (const id of ids) await post(tutor, '/api/actions/cleanupTestSession', { sessionId: id })
  }
})
