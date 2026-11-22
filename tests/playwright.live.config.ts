import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * Run a spec against the DEPLOYED app instead of a local dev server:
 *   npx playwright test -c tests/playwright.live.config.ts tests/core-loop.spec.ts
 * AI-billed specs (phase3, notes-pdf) also need RUN_AI_TESTS=1.
 * Test-only fixture actions are disabled in production, so specs that need
 * them (privacy, clustering-eval) only run locally; core-loop's cleanup
 * step is a no-op here and leaves one "__test-…" session owned by the
 * test tutor account.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://tutorpulse.app.space',
    headless: true,
    launchOptions: chromiumLaunchOptions(),
  },
})
