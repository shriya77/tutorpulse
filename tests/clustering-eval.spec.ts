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
 *
 * EVAL_SET=working uses the whiteboard set (tests/fixtures/working-eval.ts):
 * each student's working is rendered as a handwriting-style PNG and stored
 * like a real pad drawing. EVAL_NO_IMAGES=1 runs the same data with the job
 * told to ignore the images, so the two scores show what the working adds.
 */
import { writeFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { DEMO_PROBLEMS as CHAIN_RULE } from './fixtures/chain-rule-demo'
import { CALC1_WEEK4_PROBLEMS } from './fixtures/calc1-week4'
import { WORKING_PROBLEMS, type WorkingProblem } from './fixtures/working-eval'
import type { Page } from '@playwright/test'

/** EVAL_SET=calc1-week4 evaluates real Calc I Week 4 study-group problems; EVAL_SET=working the whiteboard set. */
const DEMO_PROBLEMS: WorkingProblem[] =
  process.env.EVAL_SET === 'calc1-week4' ? CALC1_WEEK4_PROBLEMS : process.env.EVAL_SET === 'working' ? WORKING_PROBLEMS : CHAIN_RULE
const NO_IMAGES = process.env.EVAL_NO_IMAGES === '1'

/** Render a student's working lines as an 800×600 handwriting-style PNG (base64), like a pad drawing. */
async function renderWorking(page: Page, lines: string[], seed: number): Promise<string> {
  const tilt = ((seed * 37) % 7) - 3
  const html = `<!doctype html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=block" rel="stylesheet">
    <style>
      body{margin:0;background:#fff}
      #pad{width:800px;height:600px;box-sizing:border-box;padding:36px 44px;font:500 40px/1.55 Caveat,'Comic Sans MS',cursive;color:#1d2b3a}
      div.l{white-space:pre;transform:rotate(${tilt * 0.3}deg)}
    </style></head><body><div id="pad">${lines
      .map((l, i) => `<div class="l" style="margin-left:${((seed + i) * 13) % 24}px">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`)
      .join('')}</div></body></html>`
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return (await page.locator('#pad').screenshot({ type: 'png' })).toString('base64')
}

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
  const topic = process.env.EVAL_TOPIC // e.g. math2413-w4: give the AI that week's misconception library

  // Handwritten working, rendered once per response that has some.
  const painter = await tutor.context.newPage()
  const problems = []
  for (const [pi, p] of DEMO_PROBLEMS.entries()) {
    const responses = []
    for (const [ri, r] of p.responses.entries()) {
      responses.push({ answer: r.answer, explanation: r.explanation, ...(r.working ? { work: await renderWorking(painter, r.working, pi * 31 + ri) } : {}) })
    }
    problems.push({ prompt: p.prompt, answer: p.answer, mistakes: p.mistakes, responses })
  }
  await painter.close()

  const seeded = (await (
    await tutor.context.request.post('/api/actions/testClusterEval', { headers: auth, data: { problems, model, topic, noImages: NO_IMAGES } })
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

    const report: string[] = [
      `set: ${process.env.EVAL_SET ?? 'chain-rule-demo'} · model: ${model ?? 'default (claude-haiku-5-5)'} · topic: ${topic ?? 'none'} · working images: ${NO_IMAGES ? 'ignored' : 'used'}`,
    ]
    const scores: number[] = []
    for (const [i, problemId] of problemIds.split(',').entries()) {
      const demo = DEMO_PROBLEMS[i]
      const subs = await query('submissions', { problemId })
      const clusters = (await query('clusters', { problemId })).sort((a, b) => Number(b.data.count) - Number(a.data.count))
      // Placeholder student N wrote response N (two responses can share an answer and note).
      const intendedOf = (s: Row) => demo.responses[Number(String(s.data.studentId).replace('eval-student-', '')) - 1]?.intended ?? '?'
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
    writeFileSync(`test-results/clustering-eval${NO_IMAGES ? '-no-images' : ''}.txt`, report.join('\n'))
    console.log('[clustering-eval]\n' + report.join('\n'))
  } finally {
    await tutor.context.request.post('/api/actions/testCleanupPrivacyFixture', { headers: auth, data: { sessionId } })
  }
})
