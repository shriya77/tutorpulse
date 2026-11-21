/**
 * Live session data for the session pages. Every hook here is a `useQuery`
 * subscription, so the Durable Object decides what each user receives: a
 * student's `submissions` query returns only their own row, and their
 * `answerKeys` / `clusters` queries return nothing.
 */

import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import type { AnswerKeyData, ClusterData, ProblemData, SessionData, SubmissionData } from '../actions/types'

export function useSessionRecord(sessionId: string | undefined) {
  const { records, status } = useQuery<SessionData>('sessions')
  const session = useMemo(() => records.find((r) => r.recordId === sessionId), [records, sessionId])
  return { session, status }
}

/** Problems of a session, in order. Only rows the session's tutor created count. */
export function useSessionProblems(sessionId: string, tutorId: string | undefined) {
  const { records, status } = useQuery<ProblemData>('problems', { where: { sessionId } })
  const problems = useMemo(
    () => records.filter((p) => p.createdBy === tutorId).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)),
    [records, tutorId],
  )
  return { problems, status }
}

/** Tutor only: their answer keys, indexed by problem id. */
export function useAnswerKeys() {
  const { records, status } = useQuery<AnswerKeyData>('answerKeys')
  const byProblem = useMemo(() => new Map(records.map((k) => [k.data.problemId, k])), [records])
  return { byProblem, status }
}

export function useSessionSubmissions(sessionId: string) {
  return useQuery<SubmissionData>('submissions', { where: { sessionId } })
}

export function useSessionClusters(sessionId: string) {
  return useQuery<ClusterData>('clusters', { where: { sessionId } })
}
