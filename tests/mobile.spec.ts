/**
 * Phone layout (students join from a QR code). Every main screen at iPhone
 * width must fit without horizontal scrolling; screenshots go to
 * test-results/mobile-*.png for a human look. Uses a correct answer, so no
 * AI is called.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

const PHONE = { width: 390, height: 844 }

async function fits(page: Page, name: string) {
  await page.screenshot({ path: `test-results/mobile-${name}.png`, fullPage: true })
  const overflow = await page.evaluate(() => {
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed')
      .filter((el) => !el.closest('.overflow-x-auto, .katex-mathml')) // deliberately scrollable math, hidden MathML
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className?.toString() ?? '').split(' ').slice(0, 3).join('.')}`)
    return { scroll: document.documentElement.scrollWidth - window.innerWidth, wide }
  })
  expect(overflow, `${name} overflows at ${PHONE.width}px`).toEqual({ scroll: 0, wide: [] })
}

test('main screens fit a phone', async ({ users }) => {
  test.setTimeout(120_000)
  const [tutor, student] = await users(2)
  await student.page.setViewportSize(PHONE)

  await student.page.goto('/')
  await expect(student.page.getByTestId('static-landing')).toBeVisible({ timeout: 15_000 })
  await fits(student.page, '0-landing')

  // Tutor (desktop) prepares and opens a session.
  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ A long session title to test wrapping on phones`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//)
  await tutor.page.locator('#new-prompt').fill('\\frac{d}{dx}\\left(\\sin(3x^2)+\\cos(5x^3)+e^{x^2}\\right)')
  await tutor.page.locator('#new-answer').fill('6x*cos(3x^2) - 15x^2*sin(5x^3) + 2x*e^(x^2)')
  await tutor.page.getByTestId('add-problem').click()
  await expect(tutor.page.getByTestId('problem-row')).toHaveCount(1, { timeout: 15_000 })
  await tutor.page.getByTestId('open-session').click()
  const code = (await tutor.page.getByTestId('join-code').textContent({ timeout: 15_000 }))!.trim()

  // Student on a phone: home, join via the QR link, answer, hint panel.
  await student.page.goto('/home')
  await expect(student.page.getByTestId('join-code-input')).toBeVisible({ timeout: 15_000 })
  await fits(student.page, '1-home')
  await student.page.goto(`/join?code=${code}`)
  await expect(student.page.getByTestId('student-problem')).toBeVisible({ timeout: 20_000 })
  await fits(student.page, '2-student')
  await student.page.getByTestId('answer-input').fill('6x*cos(3x^2) - 15x^2*sin(5x^3) + 2x*e^(x^2)')
  await student.page.getByTestId('explanation-input').fill('chain rule on each term')
  await student.page.getByTestId('submit-answer').click()
  await expect(student.page.getByTestId('submit-status')).toHaveText(/Submitted ✓/, { timeout: 15_000 })
  await student.page.getByTestId('hint-toggle').click()
  await expect(student.page.getByTestId('hint-panel')).toBeVisible()
  await fits(student.page, '3-hint-panel')

  // Tutor board on a phone too.
  await tutor.page.setViewportSize(PHONE)
  await expect(tutor.page.getByTestId('stat-submitted')).toHaveText('1', { timeout: 15_000 })
  await expect(tutor.page.getByTestId('join-qr')).toBeVisible()
  await fits(tutor.page, '4-tutor-board')

  tutor.page.once('dialog', (d) => d.accept())
  await tutor.page.getByRole('button', { name: 'End session' }).click()
  await expect(student.page.getByText('This session has ended.')).toBeVisible({ timeout: 15_000 })
  await fits(student.page, '5-ended')
})
