import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * Run a spec against the DEPLOYED app instead of a local dev server:
 *   npx playwright test -c tests/playwright.live.config.ts tests/core-loop.spec.ts
 * AI-billed specs (phase3, notes-pdf) also need RUN_AI_TESTS=1.
 * Test-only fixture actions are disabled in production, so specs that need
 * them (privacy, clustering-eval, digest) only run locally. Cleanup uses
 * `cleanupTestSession`, which works here too, so live runs leave nothing behind.
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
