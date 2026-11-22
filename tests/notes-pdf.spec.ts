/**
 * Does the managed knowledge base index a PDF directly? (SDK_NOTES Q4.)
 * Uploads a real PDF as session notes on the deployed app and waits for the
 * indexing status. Needs a PDF at tests/fixtures/notes-sample.pdf.
 *   npx playwright test -c tests/playwright.live.config.ts tests/notes-pdf.spec.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const PDF = 'tests/fixtures/notes-sample.pdf'
test.skip(loadAllTestAccounts().length < 1 || !existsSync(PDF), 'Needs a test account and tests/fixtures/notes-sample.pdf.')

test('a PDF uploaded as notes gets indexed', async ({ users }) => {
  test.setTimeout(240_000)
  const [tutor] = await users(1)
  await tutor.page.goto('/home')
  await tutor.page.getByTestId('new-session-title').fill(`__test-${Date.now()}__ notes pdf`)
  await tutor.page.getByTestId('new-session-submit').click()
  await tutor.page.waitForURL(/\/sessions\//, { timeout: 20_000 })
  await tutor.page.getByTestId('notes-input').setInputFiles({ name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: readFileSync(PDF) })
  const status = tutor.page.getByTestId('note-status')
  await expect(status).toHaveText(/Ready for hints|Could not index|Skipped/, { timeout: 180_000 })
  console.log('[notes-pdf] status:', await status.textContent())
  await expect(status).toHaveText('Ready for hints')
})
