/**
 * TEST-ONLY server actions used by tests/privacy.spec.ts (T4).
 *
 * They seed rows that clients can never write themselves (submissions,
 * clusters, practice sets) so the privacy test can check what each user is
 * allowed to READ. They are reachable only when BOTH hold:
 *   1. `ALLOW_DEBUG_ROUTES === 'true'` — set by `deepspace dev` / `deepspace
 *      test` locally, never on a deployed app (src/server/action-routes.ts
 *      does not even look these up otherwise, so production answers 404);
 *   2. the caller and every user they name are `@deepspace.test` accounts.
 *
 * Every seeded session title starts with `__test-`, and cleanup only deletes
 * rows belonging to such a session created by the caller.
 */

import { appFiles, isTestAccountEmail } from 'deepspace/worker'
import type { ActionContext, ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { checkAnswer } from '../lib/answerCheck'
import { MAX_WORK_BYTES } from '../lib/limits'
import { isPngBytes, workRelativeKey } from '../lib/work'
import { requestClustering } from './clustering-trigger'
import type { Envelope, ProblemData } from './types'

const TEST_TITLE_PREFIX = '__test-'

async function isTestUser(tools: ActionTools, userId: string): Promise<boolean> {
  const res = await tools.get('users', userId)
  if (!res.success) return false
  const email = (res.data.record.data as { email?: unknown }).email
  return typeof email === 'string' && isTestAccountEmail(email)
}

async function created(tools: ActionTools, collection: string, data: Record<string, unknown>): Promise<string> {
  const res = await tools.create(collection, data)
  if (!res.success) throw new Error(`seed ${collection}: ${res.error}`)
  return res.data.recordId
}

const seedPrivacyFixture: ActionHandler<Env> = async ({ userId, params, tools }: ActionContext<Env>) => {
  const studentIds = params.studentIds
  if (!Array.isArray(studentIds) || studentIds.length !== 2 || !studentIds.every((s) => typeof s === 'string')) {
    return { success: false, error: 'studentIds must be two user ids' }
  }
  for (const id of [userId, ...studentIds]) {
    if (!(await isTestUser(tools, id))) return { success: false, error: 'Test accounts only' }
  }
  const [studentA, studentB] = studentIds as [string, string]

  // Rows are created as the caller (the tutor), exactly as the real
  // actions/jobs will stamp owners and readers.
  const sessionId = await created(tools, 'sessions', {
    title: `${TEST_TITLE_PREFIX}${Date.now()}__ T4 privacy`,
    status: 'open',
    joinCode: 'T4TEST',
    participantIds: [studentA, studentB],
  })
  const problemId = await created(tools, 'problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}\\sin(3x^2)' })
  const answerKeyId = await created(tools, 'answerKeys', { problemId, answer: '6x*cos(3x^2)' })
  const submissionA = await created(tools, 'submissions', {
    sessionId, problemId, studentId: studentA, tutorIds: [userId],
    answer: '6x*cos(3x^2)', explanation: 'chain rule', isCorrect: 1, revision: 1,
  })
  const submissionB = await created(tools, 'submissions', {
    sessionId, problemId, studentId: studentB, tutorIds: [userId],
    answer: 'cos(3x^2)', explanation: 'derivative of sin is cos', isCorrect: 0, revision: 1,
  })
  const clusterId = await created(tools, 'clusters', {
    sessionId, problemId, label: 'Dropped the inner derivative', count: 1,
    submissionIds: [submissionB], tutorIds: [userId],
  })
  const practiceSetId = await created(tools, 'practiceSets', {
    sessionId, tutorId: userId, status: 'ready', fileKey: 'test-only', participantIds: [userId],
  })

  return {
    success: true,
    data: { sessionId, problemId, answerKeyId, submissionA, submissionB, clusterId, practiceSetId },
  }
}

const cleanupPrivacyFixture: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const sessionId = params.sessionId
  if (typeof sessionId !== 'string') return { success: false, error: 'sessionId required' }
  if (!(await isTestUser(tools, userId))) return { success: false, error: 'Test accounts only' }
  const session = await tools.get('sessions', sessionId)
  if (!session.success) return { success: true, data: { deleted: 0 } }
  const title = (session.data.record.data as { title?: unknown }).title
  if (session.data.record.createdBy !== userId || typeof title !== 'string' || !title.startsWith(TEST_TITLE_PREFIX)) {
    return { success: false, error: 'Not a test session you created' }
  }

  let deleted = 0
  // Keys of every problem in the session (follow-up checks have their own).
  const problems = await tools.query('problems', { where: { sessionId }, limit: 100 })
  for (const p of problems.success ? problems.data.records : []) {
    if (p.recordId === params.problemId) continue
    const res = await tools.deleteWhere('answerKeys', { problemId: p.recordId })
    if (res.success) deleted += res.data.deleted
  }
  for (const collection of ['practiceSets', 'clusters', 'submissions', 'followUps', 'recapRequests', 'problems']) {
    const res = await tools.deleteWhere(collection, { sessionId })
    if (res.success) deleted += res.data.deleted
  }
  const problemId = params.problemId
  if (typeof problemId === 'string') {
    const res = await tools.deleteWhere('answerKeys', { problemId })
    if (res.success) deleted += res.data.deleted
  }
  const removed = await tools.remove('sessions', sessionId)
  if (removed.success) deleted += 1
  return { success: true, data: { deleted } }
}

/**
 * Clustering evaluation: seeds problems with many realistic answers (from
 * placeholder student ids — there aren't enough test accounts to type them
 * all) and runs the REAL answer checker and the REAL clustering job, so the
 * tutor can judge the labels. Used by tests/clustering-eval.spec.ts.
 *
 * A response may carry `work` (base64 PNG of handwritten working): it is
 * stored in that placeholder student's own private folder, exactly where the
 * pad puts a real student's drawing, so the job reads it the same way.
 * `noImages: true` makes the job ignore the working, for comparison.
 */
const clusterEval: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!(await isTestUser(tools, userId))) return { success: false, error: 'Test accounts only' }
  const problems = params.problems
  if (!Array.isArray(problems) || problems.length === 0 || problems.length > 5) {
    return { success: false, error: 'problems must be a non-empty array (max 5)' }
  }
  const sessionId = await created(tools, 'sessions', {
    title: `${TEST_TITLE_PREFIX}${Date.now()}__ clustering eval`,
    topic: typeof params.topic === 'string' ? params.topic : '',
    status: 'open',
    joinCode: '',
    participantIds: [],
  })
  const problemIds: string[] = []
  for (const [i, raw] of problems.entries()) {
    const p = raw as {
      prompt: string
      answer: string
      mistakes?: string
      responses: Array<{ answer: string; explanation: string; work?: string }>
    }
    const problemId = await created(tools, 'problems', { sessionId, order: i + 1, prompt: p.prompt })
    await created(tools, 'answerKeys', { problemId, answer: p.answer, expectedMistakes: p.mistakes ?? '' })
    for (const [j, r] of p.responses.slice(0, 20).entries()) {
      const verdict = checkAnswer(r.answer, p.answer).verdict
      const studentId = `eval-student-${j + 1}`
      let workKey = ''
      if (typeof r.work === 'string' && r.work) {
        const bytes = Uint8Array.from(atob(r.work), (c) => c.charCodeAt(0))
        if (bytes.byteLength > MAX_WORK_BYTES || !isPngBytes(bytes)) return { success: false, error: 'work must be a small PNG' }
        const stored = await appFiles(env, { scope: 'self', userId: studentId }).upload(new Blob([bytes], { type: 'image/png' }), {
          key: workRelativeKey(problemId),
          name: 'working.png',
        })
        workKey = stored.key
      }
      await created(tools, 'submissions', {
        sessionId, problemId, studentId, tutorIds: [userId],
        answer: r.answer, explanation: r.explanation, workKey,
        isCorrect: verdict === 'correct' ? 1 : 0, needsReview: verdict === 'needs_review' ? 1 : 0, revision: 1,
      })
    }
    const problem = await tools.get<ProblemData>('problems', problemId)
    const model = typeof params.model === 'string' ? params.model : undefined
    if (problem.success) {
      await requestClustering(env, tools, problem.data.record as Envelope<ProblemData>, model, params.noImages === true)
    }
    problemIds.push(problemId)
  }
  return { success: true, data: { sessionId, problemIds: problemIds.join(',') } }
}

export const testActions: Record<string, ActionHandler<Env>> = {
  testSeedPrivacyFixture: seedPrivacyFixture,
  testCleanupPrivacyFixture: cleanupPrivacyFixture,
  testClusterEval: clusterEval,
}
