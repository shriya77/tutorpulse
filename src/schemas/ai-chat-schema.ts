/**
 * AI Chat Feature — Schema
 *
 * The SDK's pre-built AI chat collections (chat rows and messages; members
 * read only their own, and only the worker writes). We add the same explicit
 * signed-out deny every TutorPulse collection has; nothing is loosened.
 * Spread into the app's schemas array: ...aiChatSchemas
 */

import { AI_CHATS_SCHEMA, AI_MESSAGES_SCHEMA, type CollectionSchema } from 'deepspace/schema'
import { DENY_ALL } from './permissions'

const withSignedOutDeny = (schema: CollectionSchema): CollectionSchema => ({
  ...schema,
  permissions: { '*': DENY_ALL, ...schema.permissions },
})

export const aiChatSchemas: CollectionSchema[] = [withSignedOutDeny(AI_CHATS_SCHEMA), withSignedOutDeny(AI_MESSAGES_SCHEMA)]
