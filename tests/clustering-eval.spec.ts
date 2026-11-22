/**
 * Clustering evaluation. OPT-IN because it spends AI credits:
 *   RUN_AI_EVAL=1 [EVAL_MODEL=claude-sonnet-5-5] npx deepspace test run tests/clustering-eval.spec.ts
 *
 * Seeds the 3 demo problems with a realistic class's answers, runs the REAL
 * answer checker and clustering job, then prints each problem's clusters as
 * the tutor would see them — with the misconception each answer was written
 * to show — and a score: pairwise agreement (Rand index) between the AI's
 * grouping and the intended one, over the wrong answers. 1.00 = identical.
 * Output is also written to test-results/clustering-eval.txt.
 */
import { writeFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { DEMO_PROBLEMS as CHAIN_RULE } from './fixtures/chain-rule-demo'
import { PLTL_WEEK4_PROBLEMS } from './fixtures/pltl-week4'

/** EVAL_SET=pltl-week4 evaluates real PLTL Week 4 problems instead of the chain-rule demo. */
const DEMO_PROBLEMS = process.env.EVAL_SET === 'pltl-week4' ? PLTL_WEEK4_PROBLEMS : CHAIN_RULE

test.skip(process.env.RUN_AI_EVAL !== '1', 'Set RUN_AI_EVAL=1 to run the (AI-billed) clustering evaluation.')
test.skip(loadAllTestAccounts().length < 1, 'Needs 1 usable test account.')

type Row = { recordId: string; data: Record<string, unknown> }

function randIndex(groupsA: string[], groupsB: string[]): number {
  let agree = 0
  let pairs = 0
  for (let i = 0; i < groupsA.length; i++) {
    for (let j = i + 1; j < groupsA.length; j++) {
      pairs++
      if ((groupsA[i] === groupsA[j]) === (groupsB[i] === groupsB[j])) agree++
    }
  }
  return pairs ? agree / pairs : 1
}

test('clustering evaluation on the demo problems', async ({ users }) => {
  test.setTimeout(300_000)
  const [tutor] = await users(1)
  await tutor.page.goto('/home')
  await expect(tutor.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
  const { token } = (await (await tutor.context.request.post('/api/auth/token')).json()) as { token: string }
  const auth = { Authorization: `Bearer ${token}` }
  const model = process.env.EVAL_MODEL

  const seeded = (await (
    await tutor.context.request.post('/api/actions/testClusterEval', { headers: auth, data: { problems: DEMO_PROBLEMS, model } })
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
    await expect
      .poll(async () => (await query('problems', { sessionId })).every((p) => p.data.clusterState === 'idle'), { timeout: 240_000, intervals: [3_000] })
      .toBe(true)

    const report: string[] = [`set: ${process.env.EVAL_SET ?? 'chain-rule-demo'} · model: ${model ?? 'default (claude-haiku-5-5)'}`]
    const scores: number[] = []
    for (const [i, problemId] of problemIds.split(',').entries()) {
      const demo = DEMO_PROBLEMS[i]
      const subs = await query('submissions', { problemId })
      const clusters = (await query('clusters', { problemId })).sort((a, b) => Number(b.data.count) - Number(a.data.count))
      const intendedOf = (s: Row) => demo.responses.find((r) => r.answer === s.data.answer && r.explanation === s.data.explanation)?.intended ?? '?'
      const clusterOf = new Map<string, string>()
      for (const c of clusters) for (const id of c.data.submissionIds as string[]) clusterOf.set(id, String(c.data.label))
      const wrong = subs.filter((s) => s.data.isCorrect !== 1)
      const score = randIndex(wrong.map(intendedOf), wrong.map((s) => clusterOf.get(s.recordId) ?? '(none)'))
      scores.push(score)
      const intendedGroups = new Set(wrong.map(intendedOf)).size
      report.push(`\nProblem ${i + 1}: ${demo.prompt}  (key ${demo.answer})`)
      report.push(`  ${subs.length} answers, ${subs.length - wrong.length} correct · ${clusters.length} clusters vs ${intendedGroups} intended · agreement ${score.toFixed(2)}`)
      for (const c of clusters) {
        report.push(`  ● ${c.data.label} — ${c.data.count}`)
        report.push(`      ${c.data.explanation}`)
        for (const id of c.data.submissionIds as string[]) {
          const s = subs.find((x) => x.recordId === id)
          if (s) report.push(`      · ${String(s.data.answer).padEnd(16)} "${s.data.explanation}"  [${intendedOf(s)}]`)
        }
      }
      expect(clusters.reduce((n, c) => n + Number(c.data.count), 0)).toBe(wrong.length)
    }
    report.push(`\nmean agreement: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)}`)
    writeFileSync('test-results/clustering-eval.txt', report.join('\n'))
    console.log('[clustering-eval]\n' + report.join('\n'))
  } finally {
    await tutor.context.request.post('/api/actions/testCleanupPrivacyFixture', { headers: auth, data: { sessionId } })
  }
})
