import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL, MEMBER_READ_COLLABORATOR_ONLY } from './permissions'

/**
 * One row per student who was sent a follow-up check: "this student, in
 * misconception group `label` on `parentProblemId`, should try `problemId`".
 * Written ONLY by the `sendFollowUp` server action. Readable by that student
 * (owner) and the session's tutor (collaborator), so no student learns who
 * else was in the group. `submitAnswer` refuses a follow-up problem from
 * anyone without a row here.
 */
export const followUpsSchema: CollectionSchema = {
  name: 'followUps',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'problemId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'parentProblemId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'label', storage: 'text', interpretation: 'plain', required: true },
    { name: 'studentId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'tutorIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
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
