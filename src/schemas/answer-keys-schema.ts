import type { CollectionSchema } from 'deepspace/schema'
import { ADMIN_ALL, DENY_ALL } from './permissions'

/**
 * The correct answer for a problem, split out of `problems` because DeepSpace
 * cannot hide a single field on read. Only the row's creator (the tutor) can
 * read it. Server code only trusts a key whose `createdBy` matches the
 * problem's creator, so a key planted by someone else is ignored.
 */
export const answerKeysSchema: CollectionSchema = {
  name: 'answerKeys',
  columns: [
    { name: 'problemId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** A mathjs-parsable expression in x, e.g. `6x*cos(3x^2)`. */
    { name: 'answer', storage: 'text', interpretation: 'plain', required: true },
    /** Optional tutor note on mistakes they expect; fed to the clustering prompt. */
    { name: 'expectedMistakes', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': DENY_ALL,
    viewer: DENY_ALL,
    member: {
      read: 'own',
      create: true,
      update: 'own',
      delete: 'own',
      writableFields: ['problemId', 'answer', 'expectedMistakes'],
    },
    admin: ADMIN_ALL,
  },
}
