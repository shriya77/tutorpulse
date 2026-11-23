import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * Who may read a session's problems. Each session is a "team" whose id is
 * the session id; `problems` uses the SDK's `'team'` read rule with
 * `teamField: 'sessionId'`, so a problem is readable by its creator (the
 * tutor) and by members of its session's team, and by nobody else.
 *
 * Rows are written only by server actions: `joinSession` (and
 * `ensureSessionAccess`) add the student, `leaveSession` / `removeStudent`
 * remove them, `deleteSession` clears the team. Nobody reads this table from
 * the client; the SDK checks it directly when evaluating `'team'`.
 *
 * The column names `TeamId` / `UserId` / `status` are what the SDK's team
 * check reads (`col_teamid`, `col_userid`, `col_status`), and `UserId` is what
 * makes the SDK tell that user's open connections to resubscribe when their
 * membership changes, so access appears and disappears live.
 */
export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    { name: 'TeamId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'UserId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: 'plain', default: 'active' },
  ],
  ownerField: 'UserId',
  uniqueOn: ['TeamId', 'UserId'],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: DENY_ALL,
    admin: ADMIN_ALL,
  },
}
