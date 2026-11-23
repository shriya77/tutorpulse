/**
 * Tutor history page and its privacy. Two finished sessions, one student,
 * correct answers only (no AI). The tutor's /history shows the student's
 * trend across both; a student calling the same action gets only sessions
 * THEY ran (none), and the response never carries an email address.
 * Screenshot: test-results/history.png.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('history shows a student across sessions, to their tutor only', async ({ users }) => {
  test.setTimeout(120_000)
  const [tutor, student] = await users(2)
  const token = async (u: typeof tutor) => {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
    return ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  }
  const [tt, st] = [await token(tutor), await token(student)]
  const post = async (u: typeof tutor, t: string, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${t}` }, data })).json()) as Record<string, any>
  const create = async (collection: string, data: Record<string, unknown>) => {
    const b = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_create', { input: { collection, data } })
    return (b.result.data?.recordId ?? b.result.recordId) as string
  }

  const stamp = Date.now()
  const made: string[] = []
  try {
    for (const [i, title] of [`__test-${stamp}__ history week 1`, `__test-${stamp}__ history week 2`].entries()) {
      const sessionId = await create('sessions', { title })
      made.push(sessionId)
      const problemId = await create('problems', { sessionId, order: 1, prompt: `\\frac{d}{dx}x^${i + 2}` })
      await create('answerKeys', { problemId, answer: `${i + 2}x^${i + 1}` })
      const opened = await post(tutor, tt, '/api/actions/openSession', { sessionId })
      expect((await post(student, st, '/api/actions/joinSession', { joinCode: opened.data.joinCode })).success).toBe(true)
      expect((await post(student, st, '/api/actions/submitAnswer', { problemId, answer: `${i + 2}x^${i + 1}` })).success).toBe(true)
      expect((await post(tutor, tt, '/api/actions/closeSession', { sessionId })).success).toBe(true)
    }

    // The tutor's page.
    const tp = tutor.page
    await tp.goto('/home')
    await tp.getByTestId('history-link').click()
    await expect(tp.getByTestId('history-sessions')).toContainText(`__test-${stamp}__ history week 2`, { timeout: 20_000 })
    await expect(tp.getByTestId('history-sessions')).toContainText(`__test-${stamp}__ history week 1`)
    await expect(tp.getByTestId('history-student').first()).toBeVisible()
    await tp.screenshot({ path: 'test-results/history.png', fullPage: true })

    const mine = await post(tutor, tt, '/api/actions/tutorHistory', {})
    expect(mine.success).toBe(true)
    const row = (mine.data.students as Array<{ name: string; sessions: number; correctRate: number | null; bySession: Array<{ sessionId: string }> }>).find((s) =>
      made.every((id) => s.bySession.some((b) => b.sessionId === id)),
    )
    expect(row, 'the student appears with both sessions').toBeTruthy()
    expect(row!.name.length).toBeGreaterThan(0)
    expect(JSON.stringify(mine.data)).not.toContain('@')

    // A student asking for history gets only sessions they ran: none of these.
    const theirs = await post(student, st, '/api/actions/tutorHistory', {})
    expect(theirs.success).toBe(true)
    for (const id of made) expect(JSON.stringify(theirs.data)).not.toContain(id)
  } finally {
    for (const sessionId of made) await post(tutor, tt, '/api/actions/cleanupTestSession', { sessionId })
  }
})
