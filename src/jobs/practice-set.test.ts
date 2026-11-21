import { describe, expect, it } from 'vitest'
import type { ClusterData, Envelope, ProblemData, SessionData, SubmissionData } from '../actions/types'
import { canDownloadPracticeSet } from '../server/practice-set-routes'
import { buildPracticeSummary } from './practice-set'

const env = <T>(recordId: string, data: T, createdBy = 'tutor'): Envelope<T> => ({ recordId, data, createdBy, createdAt: '', updatedAt: '' })

describe('buildPracticeSummary', () => {
  const session = env<SessionData>('s1', { title: 'Calc', status: 'closed', participantIds: ['alice-id', 'bob-id'], clusterRuns: 1, practiceSetRuns: 0 })
  const problems = [env<ProblemData>('p2', { sessionId: 's1', order: 2, prompt: 'B', status: 'open', clusterState: 'idle' }), env<ProblemData>('p1', { sessionId: 's1', order: 1, prompt: 'A', status: 'open', clusterState: 'idle' })]
  const sub = (id: string, problemId: string, studentId: string, answer: string, ok: number) =>
    env<SubmissionData>(id, { sessionId: 's1', problemId, studentId, tutorIds: ['tutor'], answer, explanation: `${studentId} says hi`, isCorrect: ok, needsReview: 0, revision: 1 })
  const submissions = [sub('x1', 'p1', 'alice-id', '6x', 1), sub('x2', 'p1', 'bob-id', 'cos', 0), sub('x3', 'p2', 'bob-id', 'oops', 0)]
  const clusters = [
    env<ClusterData>('c1', { sessionId: 's1', problemId: 'p1', label: 'Dropped inner derivative', explanation: 'e', count: 1, submissionIds: ['x2'], tutorIds: ['tutor'] }),
    env<ClusterData>('c2', { sessionId: 's1', problemId: 'p2', label: 'Other', explanation: 'e', count: 1, submissionIds: ['x3'], tutorIds: ['tutor'] }),
  ]
  const summary = buildPracticeSummary(session, problems, new Map([['p1', '6x']]), submissions, clusters)

  it('orders problems and computes correct rates', () => {
    expect(summary.problems.map((p) => [p.number, p.prompt, p.submitted, p.correct, p.correctRate])).toEqual([
      [1, 'A', 2, 1, 0.5],
      [2, 'B', 1, 0, 0],
    ])
  })

  it('keeps real misconceptions, drops "Other", and includes example answers', () => {
    expect(summary.misconceptions).toEqual([
      { label: 'Dropped inner derivative', explanation: 'e', students: 1, problemNumber: 1, exampleWrongAnswers: ['cos'] },
    ])
  })

  it('contains no student ids, record ids or explanations', () => {
    const text = JSON.stringify(summary)
    for (const secret of ['alice-id', 'bob-id', 'x1', 'x2', 'says hi', 'tutor']) expect(text).not.toContain(secret)
  })
})

describe('canDownloadPracticeSet', () => {
  const base = { sessionId: 's', tutorId: 't', fileKey: 'k', participantIds: ['t', 'stu'] }
  it('lets the tutor download at any stage', () => {
    expect(canDownloadPracticeSet({ ...base, status: 'ready' }, 't')).toBe(true)
  })
  it('lets a listed student download only once published', () => {
    expect(canDownloadPracticeSet({ ...base, status: 'ready' }, 'stu')).toBe(false)
    expect(canDownloadPracticeSet({ ...base, status: 'published' }, 'stu')).toBe(true)
  })
  it('refuses strangers and sets without a file', () => {
    expect(canDownloadPracticeSet({ ...base, status: 'published' }, 'other')).toBe(false)
    expect(canDownloadPracticeSet({ ...base, status: 'published', fileKey: undefined }, 't')).toBe(false)
  })
})
