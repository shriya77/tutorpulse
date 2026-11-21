import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * Sidecar row for a tutor's uploaded notes file (F14). R2 file metadata has
 * no MIME type or indexing status, so we keep them here. Written only by the
 * notes actions (created as the tutor, so `'own'` = the tutor); students
 * never read it — the hint assistant searches the notes server-side.
 */
export const sessionNotesSchema: CollectionSchema = {
  name: 'sessionNotes',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'fileKey', storage: 'text', interpretation: 'plain', required: true },
    { name: 'fileName', storage: 'text', interpretation: 'plain' },
    { name: 'mimeType', storage: 'text', interpretation: 'plain' },
    { name: 'sizeBytes', storage: 'number', interpretation: 'plain' },
    /** Knowledge item id(s), JSON array (a large text file may be split). */
    { name: 'knowledgeItemIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['queued', 'running', 'completed', 'error', 'skipped', 'outdated'] },
      default: 'queued',
    },
    { name: 'error', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: { read: 'own', create: false, update: false, delete: false },
    admin: ADMIN_ALL,
  },
}
