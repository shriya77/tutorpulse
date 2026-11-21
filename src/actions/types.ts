/**
 * The `data` shapes of TutorPulse records as server code reads them.
 * Mirrors src/schemas/*. JSON columns arrive already parsed.
 */

export type SessionStatus = 'draft' | 'open' | 'closed'

export type SessionData = {
  title: string
  joinCode?: string
  status: SessionStatus
  currentProblemId?: string
  focusLabel?: string
  participantIds: string[]
  clusterRuns: number
  practiceSetRuns: number
  hintTurns?: number
}

export type ProblemData = {
  sessionId: string
  order: number
  prompt: string
  status: 'open' | 'locked'
  clusterState: 'idle' | 'running' | 'dirty'
}

/** A record envelope as returned by `tools.get` / `tools.query`. */
export interface Envelope<T> {
  recordId: string
  data: T
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AnswerKeyData = {
  problemId: string
  answer: string
  expectedMistakes?: string
}

export type SubmissionData = {
  sessionId: string
  problemId: string
  studentId: string
  tutorIds: string[]
  answer: string
  explanation: string
  isCorrect: number
  needsReview: number
  revision: number
}

export type ClusterData = {
  sessionId: string
  problemId: string
  label: string
  explanation: string
  count: number
  submissionIds: string[]
  tutorIds: string[]
}

export type PracticeSetStatus = 'generating' | 'ready' | 'published' | 'failed'

export type PracticeSetData = {
  sessionId: string
  tutorId: string
  status: PracticeSetStatus
  progressMessage?: string
  fileKey?: string
  participantIds: string[]
}
