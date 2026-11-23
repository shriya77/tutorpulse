/**
 * Core loop, end to end, three real signed-in users (T1 + T2 + T3 + clustering).
 *
 *  T1  Tutor creates a session with a problem and opens it → join code shown.
 *  T2  Two students join by code; a wrong code is rejected with an error.
 *  T3  Student A submits a correct answer, Student B a wrong one → the
 *      tutor's board shows 2 submitted / 1 correct without a reload.
 *  F9  The wrong answer is grouped into a named misconception on the board
 *      (real AI call through the DeepSpace proxy, owner-billed).
 *
 * Screenshots land in test-results/ for the checkpoint report.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const usable = loadAllTestAccounts().length
test.skip(usable < 3, `Needs 3 usable test accounts, found ${usable}.`)

test('core loop: create → open → join → submit → live board → clusters', async ({ users }) => {
  test.setTimeout(150_000)
  const [tutor, studentA, studentB] = await users(3)
  const title = `__test-${Date.now()}__ Calc I — Chain Rule`
  let sessionId = ''

  try {
    // ── T1: tutor sets up and opens ──────────────────────────────────────
    await tutor.page.goto('/home')
    await tutor.page.getByTestId('new-session-title').fill(title)
    await tutor.page.getByTestId('new-session-submit').click()
    await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
    sessionId = tutor.page.url().split('/sessions/')[1]

    await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}\\sin(3x^2)')
    await tutor.page.locator('#new-answer').fill('6x*cos(3x^2)')
    await tutor.page.locator('#new-mistakes').fill('Forgetting the inner derivative 6x')
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })

    await tutor.page.getByTestId('open-session').click()
    const codeEl = tutor.page.getByTestId('join-code')
    await expect(codeEl).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 15_000 })
    const joinCode = (await codeEl.textContent())!.trim()

    // ── T2: students join; a wrong code is rejected ─────────────────────
    await studentA.page.goto('/home')
    await studentA.page.getByTestId('join-code-input').fill('AAAAAA')
    await studentA.page.getByTestId('join-submit').click()
    await expect(studentA.page.getByTestId('join-error')).toHaveText(/No open session/, { timeout: 15_000 })

    for (const s of [studentA, studentB]) {
      await s.page.goto('/home')
      await s.page.getByTestId('join-code-input').fill(joinCode.toLowerCase())
      await s.page.getByTestId('join-submit').click()
      await s.page.waitForURL(new RegExp(`/sessions/${sessionId}`), { timeout: 20_000 })
      await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 15_000 })
    }
    await expect(tutor.page.getByTestId('joined-count')).toHaveText('2 students joined', { timeout: 15_000 })

    // ── T3: one right, one wrong; tutor board updates live ──────────────
    async function submit(page: typeof studentA.page, answer: string, explanation: string) {
      await page.getByTestId('answer-input').fill(answer)
      await page.getByTestId('explanation-input').fill(explanation)
      await page.getByTestId('submit-answer').click()
      await expect(page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
    }
    await submit(studentA.page, '6x cos(3x²)', 'chain rule: outer derivative times inner derivative')
    await submit(studentB.page, 'cos(3x^2)', 'the derivative of sin is cos')

    await expect(tutor.page.getByTestId('stat-submitted')).toHaveText('2', { timeout: 15_000 })
    await expect(tutor.page.getByTestId('stat-correct')).toHaveText('1')
    await expect(tutor.page.getByTestId('stat-wrong')).toHaveText('1')

    // ── F9: the wrong answer lands in a named cluster ────────────────────
    await expect(tutor.page.getByTestId('cluster-label').first()).toBeVisible({ timeout: 60_000 })
    const labels = await tutor.page.getByTestId('cluster-label').allTextContents()
    const counts = await tutor.page.getByTestId('cluster-count').allTextContents()
    console.log('[core-loop] clusters:', JSON.stringify(labels.map((l, i) => `${l} — ${counts[i]}`)))
    expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(1)

    await tutor.page.screenshot({ path: 'test-results/core-loop-tutor-board.png', fullPage: true })
    await studentB.page.screenshot({ path: 'test-results/core-loop-student.png', fullPage: true })

    // Students never see the board's data.
    await expect(studentB.page.getByTestId('cluster-label')).toHaveCount(0)
    await expect(studentB.page.getByTestId('stat-submitted')).toHaveCount(0)
  } finally {
    if (sessionId) {
      const res = await tutor.context.request.post('/api/auth/token')
      const { token } = (await res.json()) as { token: string }
      await tutor.context.request.post('/api/actions/cleanupTestSession', {
        headers: { Authorization: `Bearer ${token}` },
        data: { sessionId },
      })
    }
  }
})
