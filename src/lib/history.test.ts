import { describe, expect, it } from 'vitest'
import { buildHistory } from './history'

const input = {
  sessions: [
    { id: 's1', title: 'Week 4', createdAt: '2026-11-01', status: 'closed', participantIds: ['maya', 'leo'] },
    { id: 's2', title: 'Week 5', createdAt: '2026-11-08', status: 'closed', participantIds: ['maya', 'leo', 'sam'] },
  ],
  submissions: [
    { id: 'a', sessionId: 's1', studentId: 'maya', problemId: 'p1', isCorrect: 0 },
    { id: 'b', sessionId: 's1', studentId: 'leo', problemId: 'p1', isCorrect: 1 },
    { id: 'c', sessionId: 's2', studentId: 'maya', problemId: 'p2', isCorrect: 0 },
    { id: 'd', sessionId: 's2', studentId: 'maya', problemId: 'p3', isCorrect: 1 },
    { id: 'e', sessionId: 's2', studentId: 'leo', problemId: 'p2', isCorrect: 0 },
  ],
  clusters: [
    { sessionId: 's1', label: 'Forgot the inner derivative', submissionIds: ['a'] },
    { sessionId: 's2', label: 'Forgot the inner derivative', submissionIds: ['c'] },
    { sessionId: 's2', label: 'Sign error', submissionIds: ['e'] },
    { sessionId: 's2', label: 'Other', submissionIds: ['e'] },
  ],
  names: { maya: 'Maya', leo: 'Leo' },
}

describe('buildHistory', () => {
  const h = buildHistory(input)

  it('summarises sessions newest first with their top mistakes', () => {
    expect(h.sessions.map((s) => s.id)).toEqual(['s2', 's1'])
    expect(h.sessions[0]).toMatchObject({ students: 3, answers: 3, topMistakes: [{ label: 'Forgot the inner derivative', students: 1 }, { label: 'Sign error', students: 1 }] })
    expect(h.sessions[1].correctRate).toBe(0.5)
  })

  it('puts a student whose mistake came back across sessions first', () => {
    const maya = h.students[0]
    expect(maya.name).toBe('Maya')
    expect(maya.mistakes[0]).toEqual({ label: 'Forgot the inner derivative', times: 2, sessions: 2 })
    expect(maya.bySession.map((b) => b.correctRate)).toEqual([0, 0.5])
    expect(maya.correctRate).toBeCloseTo(1 / 3)
  })

  it('ignores the catch-all group and falls back to "Student" for a missing name', () => {
    const leo = h.students.find((s) => s.id === 'leo')!
    expect(leo.mistakes.map((m) => m.label)).toEqual(['Sign error'])
    const sam = h.students.find((s) => s.id === 'sam')!
    expect(sam).toMatchObject({ name: 'Student', answers: 0, correctRate: null, bySession: [{ sessionId: 's2', correctRate: null }] })
  })
})
