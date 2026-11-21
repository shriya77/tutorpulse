import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL, MEMBER_READ_COLLABORATOR_ONLY } from './permissions'

/**
 * A student's answer to one problem. Written ONLY by the `submitAnswer`
 * server action, which stamps `studentId` (the owner) and `tutorIds` (the
 * readers) from verified identity — so a student cannot forge who may read
 * their work. Readable by that student (owner) and the session's tutor
 * (collaborator); nobody else.
 *
 * No `userBound` on `studentId`: `userBound` stamps the *writer's* id, and
 * this row is written by server code. With `create: false` for every client
 * role the schema-lint agrees (docs: schemas → schema-lint warning 2).
 */
export const submissionsSchema: CollectionSchema = {
  name: 'submissions',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'problemId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'studentId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'tutorIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    { name: 'answer', storage: 'text', interpretation: 'plain' },
    { name: 'explanation', storage: 'text', interpretation: 'plain' },
    /** 1 = matches the key numerically, 0 = does not (or could not be checked). */
    { name: 'isCorrect', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    /** 1 = the answer could not be parsed, so it was sent to clustering as raw text. */
    { name: 'needsReview', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'revision', storage: 'number', interpretation: 'plain', default: 1 },
  ],
  ownerField: 'studentId',
  collaboratorsField: 'tutorIds',
  uniqueOn: ['problemId', 'studentId'],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: MEMBER_READ_COLLABORATOR_ONLY,
    admin: ADMIN_ALL,
  },
}
