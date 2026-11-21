/**
 * Server actions, exposed at POST /api/actions/<name>.
 *
 * They run with RBAC OFF, so each one starts with a guard from ./guards.
 * Test-only fixture actions live in ./test-fixtures and are not listed here.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { closeSession, joinSession, openSession } from './session-actions'
import { submitAnswer } from './submit-answer'

export const actions: Record<string, ActionHandler<Env>> = {
  openSession,
  closeSession,
  joinSession,
  submitAnswer,
}
