/**
 * Session history and per-student trends for one tutor (pure, unit-tested).
 * Input is already scoped to the tutor's own sessions by the `tutorHistory`
 * action; this only aggregates.
 *
 * A student "had" a misconception when one of their answers was in that
 * group on the board, even if they revised afterwards: the point is to spot
 * mistakes that keep coming back across weeks.
 */
import { OTHER_LABEL } from './clusters'

export type HistoryInput = {
  sessions: Array<{ id: string; title: string; createdAt: string; status: string; participantIds: string[]; topic?: string }>
  submissions: Array<{ id: string; sessionId: string; studentId: string; problemId: string; isCorrect: number }>
  clusters: Array<{ sessionId: string; label: string; submissionIds: string[] }>
  names: Record<string, string>
}

export type SessionSummary = {
  id: string
  title: string
  date: string
  status: string
  /** Course week id (src/lib/topics.ts), or ''. */
  topic: string
  students: number
  answers: number
  correctRate: number | null
  topMistakes: Array<{ label: string; students: number }>
}

export type StudentTrend = {
  id: string
  name: string
  sessions: number
  answers: number
  correctRate: number | null
  /** Correct rate per session attended, oldest first (null = joined but answered nothing). */
  bySession: Array<{
    sessionId: string
    title: string
    date: string
    topic: string
    answers: number
    correct: number
    correctRate: number | null
    /** Misconception groups their answers were in, in this session. */
    mistakes: string[]
  }>
  /** Misconception labels this student was grouped under, most frequent first. */
  mistakes: Array<{ label: string; times: number; sessions: number }>
}

const rate = (correct: number, total: number) => (total === 0 ? null : correct / total)

export function buildHistory(input: HistoryInput): { sessions: SessionSummary[]; students: StudentTrend[] } {
  const subById = new Map(input.submissions.map((s) => [s.id, s]))
  const ordered = [...input.sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const sessions: SessionSummary[] = ordered
    .map((s) => {
      const subs = input.submissions.filter((x) => x.sessionId === s.id)
      const groups = new Map<string, Set<string>>()
      for (const c of input.clusters.filter((c) => c.sessionId === s.id && c.label !== OTHER_LABEL)) {
        const set = groups.get(c.label) ?? new Set<string>()
        for (const id of c.submissionIds) {
          const sub = subById.get(id)
          if (sub) set.add(sub.studentId)
        }
        groups.set(c.label, set)
      }
      return {
        id: s.id,
        title: s.title,
        date: s.createdAt,
        status: s.status,
        topic: s.topic ?? '',
        students: new Set([...s.participantIds, ...subs.map((x) => x.studentId)]).size,
        answers: subs.length,
        correctRate: rate(subs.filter((x) => x.isCorrect === 1).length, subs.length),
        topMistakes: [...groups.entries()]
          .map(([label, set]) => ({ label, students: set.size }))
          .filter((m) => m.students > 0)
          .sort((a, b) => b.students - a.students)
          .slice(0, 3),
      }
    })
    .reverse() // newest first for the list

  const studentIds = new Set<string>()
  for (const s of input.sessions) for (const p of s.participantIds) studentIds.add(p)
  for (const x of input.submissions) studentIds.add(x.studentId)

  const students: StudentTrend[] = [...studentIds].map((id) => {
    const mine = input.submissions.filter((x) => x.studentId === id)
    const attended = ordered.filter((s) => s.participantIds.includes(id) || mine.some((x) => x.sessionId === s.id))
    const mistakes = new Map<string, { times: number; sessions: Set<string> }>()
    for (const c of input.clusters) {
      if (c.label === OTHER_LABEL) continue
      const hits = c.submissionIds.filter((sid) => subById.get(sid)?.studentId === id).length
      if (!hits) continue
      const m = mistakes.get(c.label) ?? { times: 0, sessions: new Set<string>() }
      m.times += hits
      m.sessions.add(c.sessionId)
      mistakes.set(c.label, m)
    }
    return {
      id,
      name: input.names[id] || 'Student',
      sessions: attended.length,
      answers: mine.length,
      correctRate: rate(mine.filter((x) => x.isCorrect === 1).length, mine.length),
      bySession: attended.map((s) => {
        const here = mine.filter((x) => x.sessionId === s.id)
        const correct = here.filter((x) => x.isCorrect === 1).length
        const labels = input.clusters
          .filter((c) => c.sessionId === s.id && c.label !== OTHER_LABEL && c.submissionIds.some((sid) => subById.get(sid)?.studentId === id))
          .map((c) => c.label)
        return {
          sessionId: s.id,
          title: s.title,
          date: s.createdAt,
          topic: s.topic ?? '',
          answers: here.length,
          correct,
          correctRate: rate(correct, here.length),
          mistakes: [...new Set(labels)],
        }
      }),
      mistakes: [...mistakes.entries()]
        .map(([label, m]) => ({ label, times: m.times, sessions: m.sessions.size }))
        .sort((a, b) => b.sessions - a.sessions || b.times - a.times),
    }
  })
  // Students with a mistake that came back in more than one session first, then by name.
  students.sort((a, b) => Number(b.mistakes.some((m) => m.sessions > 1)) - Number(a.mistakes.some((m) => m.sessions > 1)) || a.name.localeCompare(b.name))
  return { sessions, students }
}

/**
 * One CSV row per student per session they were in. Cells that a spreadsheet
 * would run as a formula (`=`, `+`, `-`, `@`, tab, CR: names and titles are
 * typed by people) are prefixed with `'`, then every cell is quoted.
 */
export function historyCsv(students: StudentTrend[], topicLabel: (id: string) => string = (id) => id): string {
  const cell = (v: string | number) => {
    let t = String(v)
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
    return `"${t.replace(/"/g, '""')}"`
  }
  const rows: Array<Array<string | number>> = [['Student', 'Session', 'Date', 'Week', 'Answers', 'Correct', 'Correct %', 'Mistake groups']]
  for (const s of students) {
    for (const p of s.bySession) {
      rows.push([
        s.name,
        p.title,
        p.date.slice(0, 10),
        p.topic ? topicLabel(p.topic) : '',
        p.answers,
        p.correct,
        p.correctRate === null ? '' : Math.round(p.correctRate * 100),
        p.mistakes.join('; '),
      ])
    }
  }
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`
}
