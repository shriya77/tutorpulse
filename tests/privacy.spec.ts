/**
 * T4 — Privacy. The guardrail for everything after Phase 1.
 *
 * A tutor and two students each sign in. Server code seeds one session with a
 * problem, its answer key, one submission per student, a misconception
 * cluster and an unpublished practice set. Then each user queries the data
 * layer AS THEMSELVES through the same RBAC-enforced tool path the AI hint
 * assistant uses (`/_deepspace/agent/browser/tools/*` with their own JWT).
 *
 * Passes when: a student sees only their own submission and nothing from
 * answerKeys, clusters or practiceSets, and cannot read, create or edit
 * submissions directly; the tutor (positive control) sees everything.
 *
 * Needs 3 usable test accounts (see tests/README or docs/AGENT_LOG.md).
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

const usable = loadAllTestAccounts().length
test.skip(
  usable < 3,
  `T4 needs 3 usable test accounts, found ${usable}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<Name>" --password-stdin`.',
)

type Identity = { user: MultiplayerUser; token: string; userId: string; api: APIRequestContext }

async function identify(user: MultiplayerUser): Promise<Identity> {
  // Visiting an app page creates the caller's `users` row (app membership),
  // which the agent tool routes require.
  await user.page.goto('/home')
  await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
  const res = await user.context.request.post('/api/auth/token')
  expect(res.ok()).toBeTruthy()
  const { token } = (await res.json()) as { token: string }
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string }
  return { user, token, userId: payload.sub, api: user.context.request }
}

/** Call a built-in data tool as this user; RBAC is enforced by the Durable Object. */
async function tool(who: Identity, name: string, input: Record<string, unknown>) {
  const res = await who.api.post(`/_deepspace/agent/browser/tools/${name}`, {
    headers: { Authorization: `Bearer ${who.token}` },
    data: { input },
  })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status(), body }
}

/** Rows a `records_query` returned, tolerant of the result envelope. */
function rows(body: Record<string, unknown>): Array<{ recordId: string; data: Record<string, unknown> }> {
  const result = (body.result ?? body) as Record<string, unknown>
  const data = (result.data ?? result) as Record<string, unknown>
  const records = data.records
  if (!Array.isArray(records)) throw new Error(`Unexpected query response: ${JSON.stringify(body).slice(0, 400)}`)
  return records as Array<{ recordId: string; data: Record<string, unknown> }>
}

async function query(who: Identity, collection: string, where: Record<string, unknown>) {
  const { status, body } = await tool(who, 'records_query', { collection, where, limit: 50 })
  expect(status, JSON.stringify(body).slice(0, 400)).toBe(200)
  return rows(body)
}

/** A refused tool call: non-2xx, ok:false, or an inner success:false. */
function refused({ status, body }: { status: number; body: Record<string, unknown> }): boolean {
  // A missing tool is a broken test, not a permission denial.
  expect(body.code, 'tool must exist for a refusal to mean anything').not.toBe('tool_not_found')
  const result = body.result as Record<string, unknown> | undefined
  const isRefused =
    status >= 400 || body.ok === false || result?.success === false || (typeof result?.error === 'string' && result.error.length > 0)
  // Surface why, so the report can show refusals are permission denials.
  if (isRefused) console.log(`[T4] refused (${status}): ${JSON.stringify(body).slice(0, 200)}`)
  return isRefused
}

async function action(who: Identity, name: string, params: Record<string, unknown>) {
  const res = await who.api.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${who.token}` },
    data: params,
  })
  return (await res.json()) as { success: boolean; data?: Record<string, string>; error?: string }
}

test('T4: students cannot read other students’ work, the answer key, clusters, or unpublished practice sets', async ({
  users,
}) => {
  test.setTimeout(90_000)
  const [tutorUser, aUser, bUser] = await users(3)
  const [tutor, studentA, studentB] = await Promise.all([identify(tutorUser), identify(aUser), identify(bUser)])

  const seeded = await action(tutor, 'testSeedPrivacyFixture', { studentIds: [studentA.userId, studentB.userId] })
  expect(seeded.success, seeded.error).toBe(true)
  const ids = seeded.data!
  const bySession = { sessionId: ids.sessionId }

  try {
    // ── Positive control: the tutor sees the whole session ──────────────
    expect(await query(tutor, 'submissions', bySession)).toHaveLength(2)
    expect(await query(tutor, 'answerKeys', { problemId: ids.problemId })).toHaveLength(1)
    expect(await query(tutor, 'clusters', bySession)).toHaveLength(1)
    expect(await query(tutor, 'practiceSets', bySession)).toHaveLength(1)
    expect(await query(tutor, 'sessions', { recordId: ids.sessionId })).toHaveLength(1)
    // The same call shapes the students are refused below DO work for the
    // tutor, so a refusal means "not allowed", not "malformed request".
    for (const recordId of [ids.submissionA, ids.submissionB]) {
      expect(refused(await tool(tutor, 'records_get', { collection: 'submissions', recordId }))).toBe(false)
    }
    expect(refused(await tool(tutor, 'records_get', { collection: 'answerKeys', recordId: ids.answerKeyId }))).toBe(false)
    expect(refused(await tool(tutor, 'records_get', { collection: 'clusters', recordId: ids.clusterId }))).toBe(false)
    expect(
      refused(await tool(tutor, 'records_update', { collection: 'sessions', recordId: ids.sessionId, data: { focusLabel: 'x' } })),
    ).toBe(false)

    for (const [me, other, mySubmission, otherSubmission] of [
      [studentA, studentB, ids.submissionA, ids.submissionB],
      [studentB, studentA, ids.submissionB, ids.submissionA],
    ] as const) {
      // Only my own submission.
      const subs = await query(me, 'submissions', bySession)
      expect(subs.map((s) => s.recordId)).toEqual([mySubmission])
      expect(subs[0].data.studentId).toBe(me.userId)

      // Nothing from the tutor-only collections.
      expect(await query(me, 'answerKeys', { problemId: ids.problemId })).toHaveLength(0)
      expect(await query(me, 'clusters', bySession)).toHaveLength(0)
      expect(await query(me, 'practiceSets', bySession)).toHaveLength(0)

      // Direct reads by id are refused too.
      expect(refused(await tool(me, 'records_get', { collection: 'submissions', recordId: otherSubmission }))).toBe(true)
      expect(refused(await tool(me, 'records_get', { collection: 'answerKeys', recordId: ids.answerKeyId }))).toBe(true)
      expect(refused(await tool(me, 'records_get', { collection: 'clusters', recordId: ids.clusterId }))).toBe(true)

      // Students cannot forge or edit submissions, even their own.
      expect(
        refused(
          await tool(me, 'records_create', {
            collection: 'submissions',
            data: { sessionId: ids.sessionId, problemId: ids.problemId, studentId: other.userId, tutorIds: [me.userId], answer: 'x' },
          }),
        ),
      ).toBe(true)
      expect(
        refused(await tool(me, 'records_update', { collection: 'submissions', recordId: mySubmission, data: { isCorrect: 1 } })),
      ).toBe(true)

      // They can read the session they joined (for the focus banner) …
      expect(await query(me, 'sessions', { recordId: ids.sessionId })).toHaveLength(1)
      // … but cannot add themselves or others to it.
      expect(
        refused(
          await tool(me, 'records_update', { collection: 'sessions', recordId: ids.sessionId, data: { participantIds: [] } }),
        ),
      ).toBe(true)
    }

    // The test-only seed action is not callable without a bearer token.
    const anon = await tutor.api.post('/api/actions/testSeedPrivacyFixture', { data: {} })
    expect(anon.status()).toBe(401)
  } finally {
    await action(tutor, 'cleanupTestSession', { sessionId: ids.sessionId, problemId: ids.problemId })
  }
})
