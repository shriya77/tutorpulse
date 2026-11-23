import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * A tutor's weekly digest email setting (off unless they turn it on in
 * Settings). Written ONLY by the `setWeeklyDigest` / `sendDigestPreview`
 * actions and the weekly cron task; each user reads their own row.
 */
export const digestPrefsSchema: CollectionSchema = {
  name: 'digestPrefs',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** 1 = email me the weekly summary. */
    { name: 'weekly', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    /** When the last weekly digest went out (ISO), so nobody gets two in a week. */
    { name: 'lastSentAt', storage: 'text', interpretation: 'plain', default: '' },
    /** What happened last time: sent / test_account / empty / no_email / failed. */
    { name: 'lastOutcome', storage: 'text', interpretation: 'plain', default: '' },
    /** When the tutor last asked for a preview (rate limit). */
    { name: 'lastPreviewAt', storage: 'text', interpretation: 'plain', default: '' },
  ],
  ownerField: 'userId',
  uniqueOn: ['userId'],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: { read: 'own', create: false, update: false, delete: false },
    admin: ADMIN_ALL,
  },
}
