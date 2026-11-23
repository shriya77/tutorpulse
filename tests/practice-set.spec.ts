/**
 * Practice set on its own (F15/F16/T10), without the notes and hints that
 * phase3.spec.ts also covers. Checks that the PDF came from the LaTeX path
 * (pdfTeX producer), not the sandbox fallback (matplotlib). AI-billed:
 *   RUN_AI_TESTS=1 npx deepspace test run tests/practice-set.spec.ts
 * The PDF lands in test-results/practice-set.pdf.
 */
import { readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { sessionCleanup } from './fixtures/cleanup'

test.skip(process.env.RUN_AI_TESTS !== '1', 'AI-billed: set RUN_AI_TESTS=1 to run.')
test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

const cleanUpLater = sessionCleanup()

test('practice set: wrong answers → LaTeX PDF → share → student downloads it', async ({ users }) => {
  test.setTimeout(600_000)
  const [tutor, a, b] = await users(3)

  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Practice set`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  cleanUpLater(tutor)
  await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}\\sin(3x^2)')
  await tutor.page.locator('#new-answer').fill('6x*cos(3x^2)')
  await tutor.page.getByTestId('add-problem').click()
  await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })

  await tutor.page.getByTestId('open-session').click()
  const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()
  for (const [s, ans, why] of [[a, 'cos(3x^2)', 'derivative of sin is cos'], [b, '6x*cos(3x^2)', 'chain rule']] as const) {
    await s.page.goto('/home')
    await s.page.getByTestId('join-code-input').fill(code)
    await s.page.getByTestId('join-submit').click()
    await expect(s.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
    await s.page.getByTestId('answer-input').fill(ans)
    await s.page.getByTestId('explanation-input').fill(why)
    await s.page.getByTestId('submit-answer').click()
    await expect(s.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
  }
  await expect(tutor.page.getByTestId('cluster').first()).toBeVisible({ timeout: 90_000 })

  tutor.page.once('dialog', (d) => d.accept())
  await tutor.page.getByRole('button', { name: 'End session' }).click()
  await expect(tutor.page.getByTestId('practice-panel')).toBeVisible({ timeout: 15_000 })
  await tutor.page.getByTestId('generate-practice-set').click()
  await expect(tutor.page.getByTestId('practice-status')).toHaveText('Ready to review', { timeout: 300_000 })
  await expect(a.page.getByTestId('download-practice-set')).toHaveCount(0) // nothing before sharing
  await tutor.page.getByTestId('publish-practice-set').click()
  await expect(tutor.page.getByTestId('practice-status')).toHaveText('Shared with students', { timeout: 15_000 })
  await expect(a.page.getByTestId('download-practice-set')).toBeVisible({ timeout: 20_000 })
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('download-practice-set').click()])
  const path = 'test-results/practice-set.pdf'
  await download.saveAs(path)
  const bytes = readFileSync(path)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.toString('latin1')).toMatch(/pdfTeX/) // typeset by the LaTeX path, not the sandbox fallback
  console.log(`[practice-set] student downloaded ${bytes.length} bytes`)
})
