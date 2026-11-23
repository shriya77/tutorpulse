import { describe, expect, it } from 'vitest'
import { buildDigest, isEmptyDigest } from './digest'
import { buildHistory } from './history'

const input = {
  sessions: [
    { id: 's1', title: 'Chain rule', createdAt: '2026-11-17T15:00:00Z', status: 'closed', participantIds: ['maya', 'leo'] },
    { id: 's2', title: 'Quotient rule <b>', createdAt: '2026-11-19T15:00:00Z', status: 'closed', participantIds: ['maya', 'leo'] },
  ],
  submissions: [
    { id: 'a', sessionId: 's1', studentId: 'maya', problemId: 'p1', isCorrect: 0 },
    { id: 'b', sessionId: 's1', studentId: 'leo', problemId: 'p1', isCorrect: 1 },
    { id: 'c', sessionId: 's2', studentId: 'maya', problemId: 'p2', isCorrect: 0 },
    { id: 'd', sessionId: 's2', studentId: 'leo', problemId: 'p2', isCorrect: 1 },
  ],
  clusters: [
    { sessionId: 's1', label: 'Dropped the inner derivative', submissionIds: ['a'] },
    { sessionId: 's2', label: 'Dropped the inner derivative', submissionIds: ['c'] },
  ],
  names: { maya: 'Maya Patel', leo: 'Leo' },
}

describe('buildDigest', () => {
  const week = buildHistory(input)
  const mail = buildDigest({
    tutorName: 'Shriya K',
    from: new Date('2026-11-16T14:00:00Z'),
    to: new Date('2026-11-23T14:00:00Z'),
    week,
    month: week,
    historyUrl: 'https://tutorpulse.app.space/history',
    settingsUrl: 'https://tutorpulse.app.space/settings',
  })

  it('summarises the week in the subject and intro', () => {
    expect(mail.subject).toBe('Your TutorPulse week: 2 sessions, 2 students, 4 answers (50% right)')
    expect(mail.text).toMatch(/^Hi Shriya, here is your TutorPulse week, Nov 16 to Nov 23/)
  })
  it('lists the misconception and the student it came back for', () => {
    expect(mail.text).toContain('- Dropped the inner derivative: 1 student') // one student, twice: counted once
    expect(mail.text).toContain('- Maya Patel: Dropped the inner derivative (in 2 sessions)')
    expect(mail.text).not.toContain('Leo:')
  })
  it('escapes HTML and links to history and settings', () => {
    expect(mail.html).toContain('Quotient rule &lt;b&gt;')
    expect(mail.html).not.toContain('<b>')
    expect(mail.html).toContain('href="https://tutorpulse.app.space/history"')
    expect(mail.text).toContain('Settings: https://tutorpulse.app.space/settings')
  })
  it('is empty when nothing ran', () => {
    expect(isEmptyDigest({ week: buildHistory({ ...input, sessions: [], submissions: [], clusters: [] }) })).toBe(true)
  })
})
