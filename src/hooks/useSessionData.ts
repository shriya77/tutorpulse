/**
 * Live session data for the session pages. Every hook here is a `useQuery`
 * subscription, so the Durable Object decides what each user receives: a
 * student's `submissions` query returns only their own row, and their
 * `answerKeys` / `clusters` queries return nothing.
 */

import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import type { AnswerKeyData, ClusterData, FollowUpData, ProblemData, SessionData, SubmissionData } from '../actions/types'

export function useSessionRecord(sessionId: string | undefined) {
  const { records, status } = useQuery<SessionData>('sessions')
  const session = useMemo(() => records.find((r) => r.recordId === sessionId), [records, sessionId])
  return { session, status }
}

/**
 * Problems of a session, in order. Only rows the session's tutor created count.
 * Follow-up checks (sent to one misconception group) are returned separately,
 * newest first, so they never shift the "Problem N" numbering.
 */
export function useSessionProblems(sessionId: string, tutorId: string | undefined) {
  const { records, status } = useQuery<ProblemData>('problems', { where: { sessionId } })
  const { problems, followUpProblems } = useMemo(() => {
    const own = records.filter((p) => p.createdBy === tutorId)
    return {
      problems: own.filter((p) => p.data.followUp !== 1).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)),
      followUpProblems: own.filter((p) => p.data.followUp === 1).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  }, [records, tutorId])
  return { problems, followUpProblems, status }
}

/** Follow-up rows: a student gets only their own, the tutor gets all of the session's. */
export function useFollowUps(sessionId: string) {
  return useQuery<FollowUpData>('followUps', { where: { sessionId } })
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
