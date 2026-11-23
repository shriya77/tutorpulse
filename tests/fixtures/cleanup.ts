/**
 * Delete the `__test-` sessions a spec creates through the UI, even when the
 * test fails midway. Works locally and on the deployed app (the
 * `cleanupTestSession` action only acts for @deepspace.test accounts on their
 * own `__test-` sessions). Call once at the top of a spec file:
 *
 *   const cleanUpLater = sessionCleanup()
 *   … after the tutor lands on /sessions/<id>: cleanUpLater(tutor)
 */
import { test, type MultiplayerUser } from 'deepspace/testing'

export function sessionCleanup() {
  const pending: Array<{ user: MultiplayerUser; sessionId: string }> = []
  test.afterEach(async () => {
    for (const { user, sessionId } of pending.splice(0)) {
      try {
        const { token } = (await (await user.context.request.post('/api/auth/token')).json()) as { token: string }
        await user.context.request.post('/api/actions/cleanupTestSession', { headers: { Authorization: `Bearer ${token}` }, data: { sessionId } })
      } catch {
        // The context may already be closed; nothing else to do.
      }
    }
  })
  /** Remember the session in `user`'s current /sessions/<id> URL (or the given id). */
  return (user: MultiplayerUser, sessionId?: string) => {
    const id = sessionId ?? user.page.url().split('/sessions/')[1]?.split(/[?#/]/)[0]
    if (id) pending.push({ user, sessionId: id })
  }
}
