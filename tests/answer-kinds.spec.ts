/**
 * Answer kinds beyond expressions in x, through the real submitAnswer action:
 * number lists, intervals, limits and an expression in t. Every answer is
 * correct (written differently from the key), so no AI is called.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

const CASES: Array<{ prompt: string; key: string; answer: string }> = [
  { prompt: 'Critical numbers of x^3 - 3x', key: 'x = -1, 1', answer: '±1' },
  { prompt: 'Where is x^3 - 3x increasing?', key: '(-inf, -1) U (1, inf)', answer: 'x < -1 or x > 1' },
  { prompt: '\\lim_{x\\to 0} \\frac{1}{x}', key: 'DNE', answer: 'does not exist' },
  { prompt: '\\frac{d}{dt}\\sin(t^2)', key: '2t*cos(t^2)', answer: 'cos(t²)·2t' },
]

test('numbers, intervals, limits and t are checked exactly', async ({ users }) => {
  test.setTimeout(90_000)
  const [tutor, student] = await users(2)
  const tok = async (u: typeof tutor) => {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
    return ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  }
  const [tt, st] = [await tok(tutor), await tok(student)]
  const post = async (u: typeof tutor, t: string, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${t}` }, data })).json()) as Record<string, any>
  const create = async (collection: string, data: Record<string, unknown>) => {
    const b = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_create', { input: { collection, data } })
    return (b.result.data?.recordId ?? b.result.recordId) as string
  }
  const sessionId = await create('sessions', { title: `__test-${Date.now()}__ answer kinds` })
  const ids: string[] = []
  for (const [i, c] of CASES.entries()) {
    const problemId = await create('problems', { sessionId, order: i + 1, prompt: c.prompt })
    await create('answerKeys', { problemId, answer: c.key })
    ids.push(problemId)
  }
  try {
    const opened = await post(tutor, tt, '/api/actions/openSession', { sessionId })
    expect((await post(student, st, '/api/actions/joinSession', { joinCode: opened.data.joinCode })).success).toBe(true)
    for (const [i, c] of CASES.entries()) {
      expect((await post(student, st, '/api/actions/submitAnswer', { problemId: ids[i], answer: c.answer })).success).toBe(true)
    }
    const subs = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'submissions', where: { sessionId } } })
    const rows = (subs.result.data?.records ?? subs.result.records) as Array<{ data: { problemId: string; isCorrect: number; needsReview: number } }>
    for (const [i, c] of CASES.entries()) {
      const row = rows.find((r) => r.data.problemId === ids[i])!
      expect({ key: c.key, isCorrect: row.data.isCorrect, needsReview: row.data.needsReview }).toEqual({ key: c.key, isCorrect: 1, needsReview: 0 })
    }
  } finally {
    await post(tutor, tt, '/api/actions/cleanupTestSession', { sessionId })
  }
})
