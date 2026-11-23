import { describe, expect, it } from 'vitest'
import type { ClusterData, Envelope, ProblemData, SubmissionData } from '../actions/types'
import { studentResults } from '../actions/recap-actions'
import { buildRecapEmail, oneLine } from './recapEmail'

const env = <T>(recordId: string, data: T, createdBy = 'tutor'): Envelope<T> => ({ recordId, data, createdBy, createdAt: '', updatedAt: '' })

describe('buildRecapEmail', () => {
  const mail = buildRecapEmail({
    studentName: 'Maya Lopez',
    sessionTitle: 'Week 4 <script>alert(1)</script>\nBcc: x@evil.test',
    sessionUrl: 'https://tutorpulse.app.space/sessions/s1',
    problems: [
      { number: 1, status: 'correct' },
      { number: 2, status: 'incorrect', answer: 'cos(3x^2)', mistake: 'Forgot the inner derivative' },
      { number: 3, status: 'not_answered' },
      { number: 4, status: 'needs_review', answer: 'blah' },
    ],
    practiceSetShared: true,
  })

  it('keeps the subject on one line', () => {
    expect(mail.subject).not.toMatch(/[\r\n]/)
    expect(mail.subject.startsWith('Your recap: Week 4')).toBe(true)
  })

  it('escapes everything in the HTML', () => {
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('lists the student’s own results and the practice set', () => {
    expect(mail.text).toContain('Hi Maya,')
    expect(mail.text).toContain('You got 1 of 4 right.')
    expect(mail.text).toContain('Problem 2: not quite. Your answer: cos(3x^2). The mistake to watch: Forgot the inner derivative.')
    expect(mail.text).toContain('Problem 3: not answered.')
    expect(mail.text).toContain('practice set')
    expect(mail.text).toContain('https://tutorpulse.app.space/sessions/s1')
  })

  it('has no em or en dashes', () => {
    expect(mail.text + mail.html).not.toMatch(/[—–]/)
  })
})

describe('oneLine', () => {
  it('strips control characters and caps length', () => {
    expect(oneLine('a\r\nb\tc')).toBe('a b c')
    expect(oneLine('x'.repeat(200), 10)).toHaveLength(10)
  })
})

describe('studentResults', () => {
  const problems = [1, 2, 3, 4].map((n) => env<ProblemData>(`p${n}`, { sessionId: 's', order: n, prompt: '', status: 'open', clusterState: 'idle' }))
  const sub = (id: string, problemId: string, answer: string, isCorrect: number, needsReview = 0) =>
    env<SubmissionData>(id, { sessionId: 's', problemId, studentId: 'me', tutorIds: [], answer, explanation: '', isCorrect, needsReview, revision: 1 })
  const cluster = (id: string, problemId: string, label: string, submissionIds: string[]) =>
    env<ClusterData>(id, { sessionId: 's', problemId, label, explanation: 'mentions other students', count: submissionIds.length, submissionIds, tutorIds: [] })
  const mine = [sub('a', 'p1', '3x^2', 1), sub('b', 'p2', 'cos(3x^2)', 0), sub('c', 'p3', '?', 0, 1)]
  const clusters = [cluster('c1', 'p2', 'Forgot the inner derivative', ['b', 'someone-else']), cluster('c2', 'p2', 'Other', ['b'])]
  const out = studentResults(problems, mine, clusters)

  it('gives each problem a status, with the group label only for the student’s own wrong answer', () => {
    expect(out).toEqual([
      { number: 1, status: 'correct' },
      { number: 2, status: 'incorrect', answer: 'cos(3x^2)', mistake: 'Forgot the inner derivative' },
      { number: 3, status: 'needs_review', answer: '?' },
      { number: 4, status: 'not_answered' },
    ])
  })

  it('never carries the AI explanation or other students', () => {
    expect(JSON.stringify(out)).not.toMatch(/mentions other students|someone-else/)
  })
})
