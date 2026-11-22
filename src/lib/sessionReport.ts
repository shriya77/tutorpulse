/**
 * Session report (F17) — what a tutor's local coding agent gets from
 * `npx deepspace agent invoke tutorpulse sessionReport`.
 *
 * Pure function over records the caller (the session's tutor) is already
 * allowed to read. Counts and misconceptions only: no student names, ids or
 * individual answers, so the report is safe to paste into notes or an email.
 */

import type { ClusterData, Envelope, PracticeSetData, ProblemData, SessionData, SubmissionData } from '../actions/types'
import { OTHER_LABEL } from './clusters'

export interface SessionReport {
  sessionId: string
  title: string
  status: SessionData['status']
  studentsJoined: number
  studentsWhoSubmitted: number
  problems: Array<{
    number: number
    prompt: string
    submitted: number
    correct: number
    correctRate: number | null
    needsReview: number
    misconceptions: Array<{ label: string; students: number; explanation: string }>
  }>
  topMisconceptions: Array<{ problem: number; label: string; students: number }>
  practiceSet: 'none' | PracticeSetData['status']
  aiUsage: { clusteringRuns: number; practiceSets: number; hintTurns: number }
}

export function buildSessionReport(
  session: Envelope<SessionData>,
  problems: Envelope<ProblemData>[],
  submissions: Envelope<SubmissionData>[],
  clusters: Envelope<ClusterData>[],
  practiceSets: Envelope<PracticeSetData>[],
): SessionReport {
  const ordered = problems.filter((p) => p.createdBy === session.createdBy).sort((a, b) => a.data.order - b.data.order)
  const rows = ordered.map((p, i) => {
    const subs = submissions.filter((s) => s.data.problemId === p.recordId)
    const correct = subs.filter((s) => s.data.isCorrect === 1).length
    const misconceptions = clusters
      .filter((c) => c.data.problemId === p.recordId)
      .sort((a, b) => Number(a.data.label === OTHER_LABEL) - Number(b.data.label === OTHER_LABEL) || b.data.count - a.data.count)
      .map((c) => ({ label: c.data.label, students: c.data.count, explanation: c.data.explanation ?? '' }))
    return {
      number: i + 1,
      prompt: p.data.prompt,
      submitted: subs.length,
      correct,
      correctRate: subs.length ? Math.round((correct / subs.length) * 100) / 100 : null,
      needsReview: subs.filter((s) => s.data.needsReview === 1).length,
      misconceptions,
    }
  })
  const latestSet = [...practiceSets].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    sessionId: session.recordId,
    title: session.data.title,
    status: session.data.status,
    studentsJoined: Array.isArray(session.data.participantIds) ? session.data.participantIds.length : 0,
    studentsWhoSubmitted: new Set(submissions.map((s) => s.data.studentId)).size,
    problems: rows,
    topMisconceptions: rows
      .flatMap((r) => r.misconceptions.filter((m) => m.label !== OTHER_LABEL).map((m) => ({ problem: r.number, label: m.label, students: m.students })))
      .sort((a, b) => b.students - a.students)
      .slice(0, 5),
    practiceSet: latestSet ? latestSet.data.status : 'none',
    aiUsage: {
      clusteringRuns: session.data.clusterRuns ?? 0,
      practiceSets: session.data.practiceSetRuns ?? 0,
      hintTurns: session.data.hintTurns ?? 0,
    },
  }
}
