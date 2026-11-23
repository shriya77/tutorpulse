import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * One problem in a session. Readable only by its creator (the tutor) and the
 * session's students: `'team'` read with `teamField: 'sessionId'`, where
 * `team_members` (written by the join / leave / remove actions) says who is
 * in each session. The correct answer is NOT here — it lives in `answerKeys`.
 *
 * Because any member can create a problem row, a row's `sessionId` alone is
 * not proof it belongs to that session: server code and the UI only trust a
 * problem whose `createdBy` is the session's tutor (see
 * `loadSessionProblem` in src/actions/guards.ts).
 *
 * `clusterState` is server-only: idle → running → (dirty → re-run) → idle.
 */
export const problemsSchema: CollectionSchema = {
  name: 'problems',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'order', storage: 'number', interpretation: 'plain', default: 0 },
    /** Prompt text with inline LaTeX, e.g. `Find \frac{d}{dx}\sin(3x^2)`. */
    { name: 'prompt', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['open', 'locked'] },
      default: 'open',
    },
    {
      name: 'clusterState',
      storage: 'text',
      interpretation: { kind: 'select', options: ['idle', 'running', 'dirty'] },
      default: 'idle',
    },
    /**
     * Server-only (set by `sendFollowUp`): 1 = a follow-up check sent to one
     * misconception group. Carries no label or student list, because every
     * member can read problems; who received it lives in `followUps`.
     */
    { name: 'followUp', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    /** Server-only: the problem a follow-up checks. */
    { name: 'parentProblemId', storage: 'text', interpretation: 'plain', default: '' },
  ],
  teamField: 'sessionId',
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: {
      read: 'team',
      create: true,
      update: 'own',
      delete: 'own',
      writableFields: ['sessionId', 'order', 'prompt', 'status'],
    },
    admin: ADMIN_ALL,
  },
}
