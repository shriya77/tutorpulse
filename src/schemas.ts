/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 * The permission matrix is summarised in docs/AGENT_LOG.md (Phase 1).
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { sessionsSchema } from './schemas/sessions-schema'
import { problemsSchema } from './schemas/problems-schema'
import { answerKeysSchema } from './schemas/answer-keys-schema'
import { submissionsSchema } from './schemas/submissions-schema'
import { clustersSchema } from './schemas/clusters-schema'
import { practiceSetsSchema } from './schemas/practice-sets-schema'
import { sessionNotesSchema } from './schemas/session-notes-schema'
import { followUpsSchema } from './schemas/follow-ups-schema'
import { recapRequestsSchema } from './schemas/recap-requests-schema'
import { displayNamesSchema } from './schemas/display-names-schema'
import { teamMembersSchema } from './schemas/team-members-schema'
import { digestPrefsSchema } from './schemas/digest-prefs-schema'

import { aiChatSchemas } from './schemas/ai-chat-schema'

export const schemas: CollectionSchema[] = [
  ...aiChatSchemas,
  usersSchema,
  settingsSchema,
  sessionsSchema,
  problemsSchema,
  answerKeysSchema,
  submissionsSchema,
  clustersSchema,
  practiceSetsSchema,
  sessionNotesSchema,
  followUpsSchema,
  recapRequestsSchema,
  displayNamesSchema,
  teamMembersSchema,
  digestPrefsSchema,
]
