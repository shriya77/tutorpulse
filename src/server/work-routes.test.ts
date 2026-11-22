import { describe, expect, it } from 'vitest'
import type { SubmissionData } from '../actions/types'
import { canViewWork } from './work-routes'

const sub = (over: Partial<SubmissionData> = {}): SubmissionData => ({
  sessionId: 's', problemId: 'p', studentId: 'stu', tutorIds: ['tut'], answer: 'x', explanation: '',
  isCorrect: 0, needsReview: 0, revision: 1, workKey: 'apps/a/users/stu/work/p.png', ...over,
})

describe('canViewWork', () => {
  it('lets the student and their tutor see the working', () => {
    expect(canViewWork(sub(), 'stu')).toBe(true)
    expect(canViewWork(sub(), 'tut')).toBe(true)
  })
  it('refuses other students and anyone else', () => {
    expect(canViewWork(sub(), 'other')).toBe(false)
    expect(canViewWork(sub({ tutorIds: 'tut' as unknown as string[] }), 'tut')).toBe(false)
  })
  it('refuses when there is no working', () => {
    expect(canViewWork(sub({ workKey: '' }), 'stu')).toBe(false)
  })
})
