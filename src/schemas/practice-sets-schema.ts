import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL, MEMBER_READ_COLLABORATOR_ONLY } from './permissions'

/**
 * A generated practice-set PDF for a session. Created by the `practice-set`
 * background job (so `createdBy` is the app owner, not the tutor — which is
 * why `'own'` cannot mean "the tutor" here and every write is server-only).
 *
 * `participantIds` starts as just the tutor. The `publishPracticeSet` action
 * adds the session's students and flips `status` to `published`, so students
 * cannot see an unpublished set or its file key.
 *
 * `fileKey` is the FULL stored key returned by `appFiles().upload()`
 * (`apps/<app>/users/<tutorId>/…`); the short relative key is refused by
 * `download()` (found in the Phase 0 sandbox spike).
 */
export const practiceSetsSchema: CollectionSchema = {
  name: 'practiceSets',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'tutorId', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['generating', 'ready', 'published', 'failed'] },
      default: 'generating',
    },
    /** Live progress shown to the tutor ("Writing problems…"), mirrored from the job. */
    { name: 'progressMessage', storage: 'text', interpretation: 'plain' },
    { name: 'fileKey', storage: 'text', interpretation: 'plain' },
    { name: 'participantIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
  ],
  collaboratorsField: 'participantIds',
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: MEMBER_READ_COLLABORATOR_ONLY,
    admin: ADMIN_ALL,
  },
}
