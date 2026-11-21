import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL, MEMBER_READ_COLLABORATOR_ONLY } from './permissions'

/**
 * One misconception cluster for one problem. Written ONLY by the
 * `cluster-problem` background job, which replaces a problem's clusters on
 * every run. Readable only by the session's tutor (`tutorIds`); students see
 * a cluster only when the tutor copies its label to `sessions.focusLabel`.
 */
export const clustersSchema: CollectionSchema = {
  name: 'clusters',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'problemId', storage: 'text', interpretation: 'plain', required: true },
    /** ≤ 6 words, e.g. "Dropped the inner derivative". "Other" is the catch-all. */
    { name: 'label', storage: 'text', interpretation: 'plain', required: true },
    { name: 'explanation', storage: 'text', interpretation: 'plain' },
    { name: 'count', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'submissionIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    { name: 'tutorIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
  ],
  collaboratorsField: 'tutorIds',
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: MEMBER_READ_COLLABORATOR_ONLY,
    admin: ADMIN_ALL,
  },
}
