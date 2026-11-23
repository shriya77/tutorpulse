import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * A TutorPulse-only display name, set in Settings. The `users.name` column
 * comes from the sign-in account and is rewritten on every connect, so the
 * app keeps its own name instead of renaming the person's DeepSpace account.
 *
 * Written ONLY by the `setDisplayName` action (validated). Each user can read
 * their own row; a tutor gets their students' names only through
 * `sessionDisplayNames`, scoped to a session they run.
 */
export const displayNamesSchema: CollectionSchema = {
  name: 'displayNames',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
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
