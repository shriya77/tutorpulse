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
    /** Optional PLTL week (src/lib/topics.ts); its misconception list guides cluster labels. */
    { name: 'topic', storage: 'text', interpretation: 'plain' },
    /** Misconception currently "on the board"; shown as a banner to students. */
    { name: 'focusLabel', storage: 'text', interpretation: 'plain' },
    { name: 'participantIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    /** AI usage counters, checked against src/lib/limits.ts before any AI job is enqueued. */
    { name: 'clusterRuns', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'practiceSetRuns', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'hintTurns', storage: 'number', interpretation: 'plain', default: 0 },
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
      writableFields: ['title', 'topic', 'currentProblemId', 'focusLabel'],
    },
    admin: ADMIN_ALL,
  },
}
