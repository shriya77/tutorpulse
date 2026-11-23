/**
 * Server actions, exposed at POST /api/actions/<name>.
 *
 * They run with RBAC OFF, so each one starts with a guard from ./guards.
 * Test-only fixture actions live in ./test-fixtures and are not listed here.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { closeSession, joinSession, openSession } from './session-actions'
import { generatePracticeSet, publishPracticeSet } from './practice-set-actions'
import { addSessionNotes, refreshSessionNotes } from './notes-actions'
import { submitAnswer } from './submit-answer'
import { draftFollowUp, sendFollowUp } from './follow-up-actions'
import { tutorHistory } from './history-actions'
import { sendRecaps, setRecapEmail } from './recap-actions'
import { sessionDisplayNames, setDisplayName } from './profile-actions'
import { cleanupTestSession, deleteSession } from './delete-session'

export const actions: Record<string, ActionHandler<Env>> = {
  openSession,
  closeSession,
  joinSession,
  submitAnswer,
  generatePracticeSet,
  publishPracticeSet,
  addSessionNotes,
  refreshSessionNotes,
  draftFollowUp,
  sendFollowUp,
  tutorHistory,
  setRecapEmail,
  sendRecaps,
  setDisplayName,
  sessionDisplayNames,
  deleteSession,
  cleanupTestSession,
}
