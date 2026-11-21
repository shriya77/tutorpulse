import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * One problem in a session. Readable by every signed-in member (prompts are
 * not sensitive; see REQUIREMENTS "Why it's shaped this way"). The correct
 * answer is NOT here — it lives in `answerKeys`.
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
  ],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: {
      read: true,
      create: true,
      update: 'own',
      delete: 'own',
      writableFields: ['sessionId', 'order', 'prompt', 'status'],
    },
    admin: ADMIN_ALL,
  },
}
