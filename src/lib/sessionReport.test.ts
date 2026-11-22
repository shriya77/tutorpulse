import { describe, expect, it } from 'vitest'
import type { ClusterData, Envelope, PracticeSetData, ProblemData, SessionData, SubmissionData } from '../actions/types'
import { buildSessionReport } from './sessionReport'

const env = <T>(recordId: string, data: T, createdBy = 'tutor', createdAt = ''): Envelope<T> => ({ recordId, data, createdBy, createdAt, updatedAt: '' })

const session = env<SessionData>('s1', {
  title: 'Chain rule', status: 'closed', participantIds: ['alice', 'bob', 'cara'], clusterRuns: 4, practiceSetRuns: 1, hintTurns: 7,
})
const problems = [
  env<ProblemData>('p2', { sessionId: 's1', order: 2, prompt: 'B', status: 'open', clusterState: 'idle' }),
  env<ProblemData>('p1', { sessionId: 's1', order: 1, prompt: 'A', status: 'open', clusterState: 'idle' }),
  env<ProblemData>('px', { sessionId: 's1', order: 0, prompt: 'planted', status: 'open', clusterState: 'idle' }, 'stranger'),
]
const sub = (id: string, problemId: string, studentId: string, ok: number, review = 0) =>
  env<SubmissionData>(id, { sessionId: 's1', problemId, studentId, tutorIds: ['tutor'], answer: `secret-${id}`, explanation: 'x', isCorrect: ok, needsReview: review, revision: 1 })
const submissions = [sub('a1', 'p1', 'alice', 1), sub('b1', 'p1', 'bob', 0), sub('b2', 'p2', 'bob', 0, 1)]
const clusters = [
  env<ClusterData>('c1', { sessionId: 's1', problemId: 'p1', label: 'Dropped the inner derivative', explanation: 'e1', count: 1, submissionIds: ['b1'], tutorIds: ['tutor'] }),
  env<ClusterData>('c2', { sessionId: 's1', problemId: 'p2', label: 'Other', explanation: 'e2', count: 1, submissionIds: ['b2'], tutorIds: ['tutor'] }),
]
const sets = [
  env<PracticeSetData>('ps1', { sessionId: 's1', tutorId: 'tutor', status: 'ready', participantIds: ['tutor'] }, 'owner', '2026-11-21T10:00'),
  env<PracticeSetData>('ps2', { sessionId: 's1', tutorId: 'tutor', status: 'published', participantIds: ['tutor'] }, 'owner', '2026-11-21T11:00'),
]

describe('buildSessionReport (F17)', () => {
  const report = buildSessionReport(session, problems, submissions, clusters, sets)

  it('summarises the session', () => {
    expect(report).toMatchObject({ title: 'Chain rule', status: 'closed', studentsJoined: 3, studentsWhoSubmitted: 2, practiceSet: 'published' })
    expect(report.aiUsage).toEqual({ clusteringRuns: 4, practiceSets: 1, hintTurns: 7 })
  })

  it('reports per-problem counts in order, ignoring planted problems', () => {
    expect(report.problems.map((p) => [p.number, p.prompt, p.submitted, p.correct, p.correctRate, p.needsReview])).toEqual([
      [1, 'A', 2, 1, 0.5, 0],
      [2, 'B', 1, 0, 0, 1],
    ])
  })

  it('lists top misconceptions without "Other"', () => {
    expect(report.topMisconceptions).toEqual([{ problem: 1, label: 'Dropped the inner derivative', students: 1 }])
  })

  it('contains no student names, ids or answers', () => {
    const text = JSON.stringify(report)
    for (const secret of ['alice', 'bob', 'cara', 'secret-', 'a1', 'b1', 'planted']) expect(text).not.toContain(secret)
  })
})
