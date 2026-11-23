/**
 * The Checkpoint 2 manual walkthrough, automated with three real signed-in
 * users. Run against the live app:
 *   npx playwright test -c tests/playwright.live.config.ts tests/walkthrough.spec.ts
 * Screenshots: test-results/walkthrough-*.png
 *
 * Covers what core-loop.spec does not: a wrong answer revised to correct
 * removes it from its cluster, lock / re-open, switching the shown problem,
 * and ending the session.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'
import { sessionCleanup } from './fixtures/cleanup'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 usable test accounts.')

const cleanUpLater = sessionCleanup()

const shot = (u: MultiplayerUser, name: string) => u.page.screenshot({ path: `test-results/walkthrough-${name}.png`, fullPage: true })

test('walkthrough: wrong → cluster, revise → cluster gone, lock, next problem, end', async ({ users }) => {
  test.setTimeout(240_000)
  const [tutor, a, b] = await users(3)

  // 1. Tutor creates a 2-problem session and opens it.
  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ Walkthrough`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  cleanUpLater(tutor)
  const sessionUrl = new URL(tutor.page.url()).pathname
  const problemsToAdd = [['\\frac{d}{dx}\\sin(3x^2)', '6x*cos(3x^2)'], ['\\frac{d}{dx}(2x+1)^5', '10*(2x+1)^4']]
  for (const [i, [prompt, answer]] of problemsToAdd.entries()) {
    await tutor.page.locator('#new-prompt').fill(prompt)
    await tutor.page.locator('#new-answer').fill(answer)
    await tutor.page.getByTestId('add-problem').click()
    await expect(tutor.page.getByTestId('problem-row')).toHaveCount(i + 1, { timeout: 15_000 })
    await expect(tutor.page.locator('#new-prompt')).toBeEnabled() // save finished, form ready again
  }
  await expect(tutor.page.getByTestId('problem-row')).toHaveCount(2, { timeout: 15_000 })
  await shot(tutor, '1-setup')
  await tutor.page.getByTestId('open-session').click()
  await expect(tutor.page.getByTestId('join-code')).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 15_000 })
  const code = (await tutor.page.getByTestId('join-code').textContent())!.trim()

  // 2. Wrong code rejected; both students join.
  await a.page.goto('/home')
  await a.page.getByTestId('join-code-input').fill('AAAAAA')
  await a.page.getByTestId('join-submit').click()
  await expect(a.page.getByTestId('join-error')).toHaveText('No open session with that code', { timeout: 15_000 })
  for (const s of [a, b]) {
    await s.page.goto('/home')
    await s.page.getByTestId('join-code-input').fill(code)
    await s.page.getByTestId('join-submit').click()
    await s.page.waitForURL((u) => u.pathname === sessionUrl, { timeout: 20_000 })
  }
  await expect(tutor.page.getByTestId('joined-count')).toHaveText('2 students joined', { timeout: 15_000 })

  const board1 = tutor.page.getByTestId('board-problem').first()
  const submit = async (u: MultiplayerUser, answer: string, why: string) => {
    await u.page.getByTestId('answer-input').fill(answer)
    await u.page.getByTestId('explanation-input').fill(why)
    await u.page.getByTestId('submit-answer').click()
  }

  // 3. A wrong answer → counts, then a named cluster.
  await submit(b, 'cos(3x^2)', 'derivative of sin is cos')
  await expect(b.page.getByTestId('submit-status')).toHaveText('Submitted ✓', { timeout: 15_000 })
  await expect(board1.getByTestId('stat-submitted')).toHaveText('1', { timeout: 15_000 })
  await expect(board1.getByTestId('stat-correct')).toHaveText('0')
  await expect(board1.getByTestId('cluster')).toHaveCount(1, { timeout: 60_000 })
  console.log('[walkthrough] cluster:', await board1.getByTestId('cluster-label').textContent())
  await shot(tutor, '3-cluster')
  await board1.screenshot({ path: 'test-results/walkthrough-3-board-card.png' })

  // 4. A right answer → 2 / 1.
  await submit(a, '6x cos(3x²)', 'outer derivative times inner derivative')
  await expect(board1.getByTestId('stat-submitted')).toHaveText('2', { timeout: 15_000 })
  await expect(board1.getByTestId('stat-correct')).toHaveText('1')

  // 5. The wrong student revises to correct → correct 2, cluster disappears.
  await submit(b, '6x*cos(3x^2)', 'forgot the inside, fixed it')
  await expect(b.page.getByTestId('submit-status')).toHaveText('Submitted ✓ (revision 2)', { timeout: 15_000 })
  await expect(board1.getByTestId('stat-correct')).toHaveText('2', { timeout: 15_000 })
  await expect(board1.getByTestId('stat-wrong')).toHaveText('0')
  await expect(board1.getByTestId('cluster')).toHaveCount(0, { timeout: 60_000 })
  await shot(tutor, '5-revised')

  // 6a. Lock → student form disabled; re-open → enabled.
  await board1.getByRole('button', { name: 'Lock answers' }).click()
  await expect(a.page.getByTestId('submit-status')).toHaveText('Answers are locked for this problem.', { timeout: 15_000 })
  await expect(a.page.getByTestId('answer-input')).toBeDisabled()
  await shot(a, '6a-locked')
  await board1.getByRole('button', { name: 'Re-open answers' }).click()
  await expect(a.page.getByTestId('answer-input')).toBeEnabled({ timeout: 15_000 })

  // 6b. Show problem 2 → students switch.
  await tutor.page.getByTestId('board-problem').nth(1).getByRole('button', { name: 'Show to students' }).click()
  for (const s of [a, b]) await expect(s.page.getByRole('heading', { name: 'Problem 2' })).toBeVisible({ timeout: 15_000 })
  await shot(b, '6b-problem2')

  // End the session → students see the end screen and can't submit.
  tutor.page.once('dialog', (d) => d.accept())
  await tutor.page.getByRole('button', { name: 'End session' }).click()
  for (const s of [a, b]) await expect(s.page.getByText('This session has ended.')).toBeVisible({ timeout: 15_000 })
  await shot(tutor, '7-ended')
})
