/**
 * Clustering evaluation (T8-style, run locally). OPT-IN because it spends AI
 * credits: `RUN_AI_EVAL=1 npx deepspace test run tests/clustering-eval.spec.ts`.
 *
 * Seeds the 3 demo chain-rule problems with realistic answers, runs the real
 * answer checker and clustering job, then prints each problem's clusters as
 * the tutor would see them, for a human to judge.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { DEMO_PROBLEMS } from './fixtures/chain-rule-demo'

test.skip(process.env.RUN_AI_EVAL !== '1', 'Set RUN_AI_EVAL=1 to run the (AI-billed) clustering evaluation.')
test.skip(loadAllTestAccounts().length < 1, 'Needs 1 usable test account.')

type Row = { recordId: string; data: Record<string, unknown> }

test('clustering evaluation on the demo problems', async ({ users }) => {
  test.setTimeout(240_000)
  const [tutor] = await users(1)
  await tutor.page.goto('/home')
  await expect(tutor.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
  const { token } = (await (await tutor.context.request.post('/api/auth/token')).json()) as { token: string }
  const auth = { Authorization: `Bearer ${token}` }

  const seeded = (await (
    await tutor.context.request.post('/api/actions/testClusterEval', { headers: auth, data: { problems: DEMO_PROBLEMS } })
  ).json()) as { success: boolean; data?: { sessionId: string; problemIds: string }; error?: string }
  expect(seeded.success, seeded.error).toBe(true)
  const { sessionId, problemIds } = seeded.data!

  async function query(collection: string, where: Record<string, unknown>): Promise<Row[]> {
    const res = await tutor.context.request.post('/_deepspace/agent/browser/tools/records_query', {
      headers: auth,
      data: { input: { collection, where, limit: 50 } },
    })
    const body = (await res.json()) as { result?: { data?: { records?: Row[] }; records?: Row[] } }
    return body.result?.data?.records ?? body.result?.records ?? []
  }

  try {
    // Wait until every problem has finished clustering.
    await expect
      .poll(async () => (await query('problems', { sessionId })).every((p) => p.data.clusterState === 'idle'), {
        timeout: 180_000,
        intervals: [3_000],
      })
      .toBe(true)

    const report: string[] = []
    for (const [i, problemId] of problemIds.split(',').entries()) {
      const subs = await query('submissions', { problemId })
      const clusters = (await query('clusters', { problemId })).sort((a, b) => Number(b.data.count) - Number(a.data.count))
      const byId = new Map(subs.map((s) => [s.recordId, s.data]))
      report.push(`\nProblem ${i + 1}: ${DEMO_PROBLEMS[i].prompt}   (key ${DEMO_PROBLEMS[i].answer})`)
      report.push(`  ${subs.length} answers, ${subs.filter((s) => s.data.isCorrect === 1).length} correct`)
      for (const c of clusters) {
        report.push(`  ● ${c.data.label} — ${c.data.count}`)
        report.push(`      ${c.data.explanation}`)
        for (const id of c.data.submissionIds as string[]) {
          const s = byId.get(id)
          report.push(`      · ${s?.answer}   "${s?.explanation}"`)
        }
      }
      const wrong = subs.filter((s) => s.data.isCorrect !== 1).length
      expect(clusters.reduce((n, c) => n + Number(c.data.count), 0)).toBe(wrong)
    }
    console.log('[clustering-eval]' + report.join('\n'))
  } finally {
    await tutor.context.request.post('/api/actions/testCleanupPrivacyFixture', { headers: auth, data: { sessionId } })
  }
})
