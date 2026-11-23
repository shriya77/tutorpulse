/**
 * Scheduled tasks, run by the AppCronRoom DO (worker.ts).
 *
 * `weekly-digest` (Mondays 08:00 US Central): every tutor who turned on the
 * weekly summary in Settings gets an email about their past 7 days
 * (src/server/digest.ts), billed to the app owner through `email/send`.
 * Nobody is emailed twice within 6 days, a week with no sessions sends
 * nothing, and test accounts are never emailed.
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { DAY_MS, sendTutorDigest, type Reader } from './server/digest'
import type { Envelope } from './actions/types'

export const WEEKLY_DIGEST = 'weekly-digest'
const MAX_DIGESTS_PER_RUN = 200

export const tasks: CronTask[] = [{ name: WEEKLY_DIGEST, schedule: '0 8 * * 1', timezone: 'America/Chicago' }]

type Pref = { userId: string; weekly: number; lastSentAt?: string }

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === WEEKLY_DIGEST) await runWeeklyDigest(env)
}

/**
 * One weekly run. `onlyUserId` + `ignoreLastSent` exist for the local test
 * fixture (`testRunWeeklyDigest`), which runs it for the calling test account
 * alone; the schedule always runs it for everyone, with the once-a-week guard.
 */
export async function runWeeklyDigest(env: Env, opts: { onlyUserId?: string; ignoreLastSent?: boolean } = {}): Promise<Record<string, number>> {
  if (!env.OWNER_USER_ID) throw new Error('OWNER_USER_ID is not set')
  const cron = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const read: Reader = async (collection, where, limit = 500) =>
    (await cron.records.query(collection, { where, limit })) as Envelope<Record<string, unknown>>[]
  const now = new Date()
  const prefs = ((await cron.records.query('digestPrefs', { where: { weekly: 1 }, limit: 1000 })) as Envelope<Pref>[])
    .filter((p) => p.data.weekly === 1 && (!opts.onlyUserId || p.data.userId === opts.onlyUserId))
    .filter((p) => opts.ignoreLastSent || !p.data.lastSentAt || now.getTime() - Date.parse(p.data.lastSentAt) > 6 * DAY_MS)
    .slice(0, MAX_DIGESTS_PER_RUN)

  const tally: Record<string, number> = {}
  for (const p of prefs) {
    let outcome
    try {
      outcome = await sendTutorDigest(read, p.data.userId, now, env.APP_NAME, async (mail) => {
        try {
          await cron.integrations.call('email/send', { to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
          return true
        } catch (e) {
          console.warn('[digest] send failed', e instanceof Error ? e.message.slice(0, 120) : 'unknown')
          return false
        }
      })
    } catch (e) {
      console.warn('[digest] build failed', e instanceof Error ? e.message.slice(0, 120) : 'unknown')
      outcome = 'failed' as const
    }
    tally[outcome] = (tally[outcome] ?? 0) + 1
    // Only a real send (or a test account's stand-in) counts as this week's digest.
    const done = outcome === 'sent' || outcome === 'test_account'
    await cron.records.update('digestPrefs', p.recordId, { lastOutcome: outcome, ...(done ? { lastSentAt: now.toISOString() } : {}) })
  }
  console.log('[digest] weekly run', JSON.stringify({ tutors: prefs.length, ...tally }))
  return tally
}
