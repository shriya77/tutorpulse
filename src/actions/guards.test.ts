import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { loadSessionProblem, PROBLEM_NOT_FOUND, requireParticipant, requireTutor, SESSION_NOT_FOUND } from './guards'

const TUTOR = 'user_tutor'
const STUDENT = 'user_student'
const STRANGER = 'user_stranger'

type Row = { recordId: string; data: Record<string, unknown>; createdBy: string }

/** A fake of the RBAC-bypassing action tools over an in-memory table. */
function fakeTools(rows: Record<string, Row[]>): ActionTools {
  const get = async (collection: string, recordId: string) => {
    const record = (rows[collection] ?? []).find((r) => r.recordId === recordId)
    return record
      ? { success: true as const, data: { record: { ...record, createdAt: '', updatedAt: '' } } }
      : { success: false as const, error: 'Record not found' }
  }
  return { get } as unknown as ActionTools
}

const session = (status = 'open'): Row => ({
  recordId: 'sess_1',
  createdBy: TUTOR,
  data: { title: 'Calc', status, participantIds: [STUDENT], clusterRuns: 0, practiceSetRuns: 0 },
})

describe('requireTutor', () => {
  const tools = fakeTools({ sessions: [session()] })

  it('allows the session creator', async () => {
    const g = await requireTutor({ userId: TUTOR, tools }, 'sess_1')
    expect(g.ok).toBe(true)
  })

  it.each([STUDENT, STRANGER])('rejects %s with the generic error', async (userId) => {
    expect(await requireTutor({ userId, tools }, 'sess_1')).toEqual({ ok: false, error: SESSION_NOT_FOUND })
  })

  it('rejects a missing or malformed session id the same way', async () => {
    expect(await requireTutor({ userId: TUTOR, tools }, 'nope')).toEqual({ ok: false, error: SESSION_NOT_FOUND })
    expect(await requireTutor({ userId: TUTOR, tools }, undefined)).toEqual({ ok: false, error: SESSION_NOT_FOUND })
    expect(await requireTutor({ userId: TUTOR, tools }, { $ne: '' })).toEqual({ ok: false, error: SESSION_NOT_FOUND })
  })

  it('enforces an allowed status list', async () => {
    const closed = fakeTools({ sessions: [session('closed')] })
    const g = await requireTutor({ userId: TUTOR, tools: closed }, 'sess_1', { statuses: ['open'] })
    expect(g).toEqual({ ok: false, error: 'Session is closed' })
  })
})

describe('requireParticipant', () => {
  const tools = fakeTools({ sessions: [session()] })

  it('allows a joined student', async () => {
    expect((await requireParticipant({ userId: STUDENT, tools }, 'sess_1')).ok).toBe(true)
  })

  it('rejects the tutor (tutors do not submit) and strangers', async () => {
    expect(await requireParticipant({ userId: TUTOR, tools }, 'sess_1')).toEqual({ ok: false, error: SESSION_NOT_FOUND })
    expect(await requireParticipant({ userId: STRANGER, tools }, 'sess_1')).toEqual({ ok: false, error: SESSION_NOT_FOUND })
  })

  it('treats a malformed participant list as empty', async () => {
    const bad = fakeTools({ sessions: [{ ...session(), data: { ...session().data, participantIds: 'user_student' } }] })
    expect((await requireParticipant({ userId: STUDENT, tools: bad }, 'sess_1')).ok).toBe(false)
  })
})

describe('loadSessionProblem', () => {
  it("accepts a problem created by the session's tutor", async () => {
    const tools = fakeTools({
      sessions: [session()],
      problems: [{ recordId: 'p1', createdBy: TUTOR, data: { sessionId: 'sess_1', prompt: 'x' } }],
    })
    expect((await loadSessionProblem({ userId: STUDENT, tools }, 'p1')).ok).toBe(true)
  })

  it("rejects a problem planted in someone else's session", async () => {
    const tools = fakeTools({
      sessions: [session()],
      problems: [{ recordId: 'p1', createdBy: STRANGER, data: { sessionId: 'sess_1', prompt: 'x' } }],
    })
    expect(await loadSessionProblem({ userId: STUDENT, tools }, 'p1')).toEqual({ ok: false, error: PROBLEM_NOT_FOUND })
  })
})
