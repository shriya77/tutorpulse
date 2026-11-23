import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL, MEMBER_READ_COLLABORATOR_ONLY } from './permissions'

/**
 * A student's opt-in to an emailed recap of one session. Email is opt-in per
 * session: no row (or `wantsEmail` 0) means the student is never emailed.
 * Written ONLY by server actions: `setRecapEmail` (the student) and
 * `sendRecaps` (the tutor; sets `sentAt` so nobody is emailed twice).
 * Readable by that student (owner) and the session's tutor (collaborator).
 * Email addresses are never stored here or returned to anyone.
 */
export const recapRequestsSchema: CollectionSchema = {
  name: 'recapRequests',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'studentId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'tutorIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    { name: 'wantsEmail', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    /** ISO time the recap went out ('' = not yet). */
    { name: 'sentAt', storage: 'text', interpretation: 'plain', default: '' },
    /** 'sent', or 'test_account' when the address is a @deepspace.test account and nothing was sent. */
    { name: 'delivery', storage: 'text', interpretation: 'plain', default: '' },
  ],
  ownerField: 'studentId',
  collaboratorsField: 'tutorIds',
  uniqueOn: ['sessionId', 'studentId'],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: MEMBER_READ_COLLABORATOR_ONLY,
    admin: ADMIN_ALL,
  },
}
