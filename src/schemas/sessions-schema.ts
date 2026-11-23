import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * A live tutoring session. The tutor is the row's creator (`createdBy`, the
 * default owner). Students are added to `participantIds` only by the
 * `joinSession` action, which makes them collaborators and so lets them read
 * this row (for `focusLabel`, `currentProblemId`, `status`).
 *
 * The tutor's client may only write the fields in `writableFields`.
 * `joinCode`, `status`, `participantIds` and the AI usage counters are set by
 * server actions, so a tutor's client cannot add people or reset the caps.
 */
export const sessionsSchema: CollectionSchema = {
  name: 'sessions',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'joinCode', storage: 'text', interpretation: 'plain' },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['draft', 'open', 'closed'] },
      default: 'draft',
    },
    { name: 'currentProblemId', storage: 'text', interpretation: 'plain' },
    /** Optional Calc I course week (src/lib/topics.ts); its misconception list guides cluster labels. */
    { name: 'topic', storage: 'text', interpretation: 'plain' },
    /** Misconception currently "on the board"; shown as a banner to students. */
    { name: 'focusLabel', storage: 'text', interpretation: 'plain' },
    { name: 'participantIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    /** AI usage counters, checked against src/lib/limits.ts before any AI job is enqueued. */
    { name: 'clusterRuns', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'practiceSetRuns', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'hintTurns', storage: 'number', interpretation: 'plain', default: 0 },
    /** Server-only: AI follow-up drafts used (cap in src/lib/limits.ts). */
    { name: 'followUpDrafts', storage: 'number', interpretation: 'plain', default: 0 },
    /** Optional countdown on the problem being shown: when it ends (ISO) and which problem it's for. Tutor-set. */
    { name: 'timerEndsAt', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'timerProblemId', storage: 'text', interpretation: 'plain', default: '' },
    /** Server-only (set by `sendRecaps`): when the tutor last sent recap emails. Students then stop seeing the opt-in. */
    { name: 'recapsSentAt', storage: 'text', interpretation: 'plain', default: '' },
    /** Server-only (set by `removeStudent`): students the tutor removed; the join code no longer lets them in. */
    { name: 'removedIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    /** 1 = the tutor archived it: tucked away under "Archived" on their home page. Only changes the tutor's own list. */
    { name: 'archived', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  collaboratorsField: 'participantIds',
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: {
      read: 'collaborator',
      create: true,
      update: 'own',
      delete: 'own',
      writableFields: ['title', 'topic', 'currentProblemId', 'focusLabel', 'archived', 'timerEndsAt', 'timerProblemId'],
    },
    admin: ADMIN_ALL,
  },
}
