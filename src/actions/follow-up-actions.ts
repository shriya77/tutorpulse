/**
 * Follow-up checks: after the tutor teaches to a misconception group, send
 * that group ONE fresh problem aimed at the same mistake, to see whether it
 * really cleared.
 *
 *   draftFollowUp  - AI suggests a problem (owner-billed, capped per session).
 *                    For derivative questions mathjs writes the prompt and key
 *                    from the suggested function, so the key is exact
 *                    (`verified`); anything else is for the tutor to check.
 *   sendFollowUp   - the tutor's reviewed prompt + key become a problem the
 *                    tutor owns, plus one `followUps` row per student in the
 *                    group. Nothing is written until the tutor sends.
 *
 * Both start with requireTutor and only touch the cluster's own session.
 */
import { generateText, Output } from 'ai'
import { createDeepSpaceAI } from 'deepspace/worker'
import type { ActionContext, ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { buildFollowUpPrompt, FOLLOW_UP_INSTRUCTIONS, followUpOutputSchema } from '../ai/prompts/follow-up'
import { derivativeProblem, keyKind } from '../lib/answerCheck'
import { MAX_FOLLOWUP_DRAFTS_PER_SESSION } from '../lib/limits'
import { CLUSTER_MODEL } from '../jobs/cluster-problem'
import { loadSessionProblem, requireTutor, SESSION_NOT_FOUND } from './guards'
import type { AnswerKeyData, ClusterData, Envelope, ProblemData, SessionData, SubmissionData } from './types'

const MAX_PROMPT = 500

type Loaded = {
  session: Envelope<SessionData>
  cluster: Envelope<ClusterData>
  parent: Envelope<ProblemData>
  key: Envelope<AnswerKeyData> | undefined
  studentIds: string[]
}

/** The cluster, its session (caller must be the tutor, session open) and the group's students. */
async function loadGroup(ctx: ActionContext<Env>): Promise<{ ok: true } & Loaded | { ok: false; error: string }> {
  const clusterId = ctx.params.clusterId
  if (typeof clusterId !== 'string' || !clusterId) return { ok: false, error: SESSION_NOT_FOUND }
  const c = await ctx.tools.get<ClusterData>('clusters', clusterId)
  if (!c.success) return { ok: false, error: SESSION_NOT_FOUND }
  const cluster = c.data.record as Envelope<ClusterData>
  const g = await requireTutor(ctx, cluster.data.sessionId, { statuses: ['open'] })
  if (!g.ok) return g
  const { session } = g
  const p = await loadSessionProblem(ctx, cluster.data.problemId)
  if (!p.ok || p.problem.data.sessionId !== session.recordId) return { ok: false, error: SESSION_NOT_FOUND }

  const keys = await ctx.tools.query<AnswerKeyData>('answerKeys', { where: { problemId: p.problem.recordId } })
  const key = keys.success ? (keys.data.records as Envelope<AnswerKeyData>[]).find((k) => k.createdBy === session.createdBy) : undefined

  // Everyone the group was built from, including those who have since revised:
  // re-answering the same problem after the explanation is what we want to look past.
  const ids = new Set(Array.isArray(cluster.data.submissionIds) ? cluster.data.submissionIds : [])
  const subs = await ctx.tools.query<SubmissionData>('submissions', { where: { problemId: p.problem.recordId }, limit: 200 })
  const participants = new Set(Array.isArray(session.data.participantIds) ? session.data.participantIds : [])
  const studentIds = subs.success
    ? [...new Set((subs.data.records as Envelope<SubmissionData>[])
        .filter((s) => ids.has(s.recordId) && s.data.sessionId === session.recordId && participants.has(s.data.studentId))
        .map((s) => s.data.studentId))]
    : []
  return { ok: true, session, cluster, parent: p.problem, key, studentIds }
}

export const draftFollowUp: ActionHandler<Env> = async (ctx) => {
  const g = await loadGroup(ctx)
  if (!g.ok) return { success: false, error: g.error }
  if (!g.key) return { success: false, error: 'This problem has no answer key' }
  if (g.studentIds.length === 0) return { success: false, error: 'Nobody is in this group any more' }
  const used = g.session.data.followUpDrafts ?? 0
  if (used >= MAX_FOLLOWUP_DRAFTS_PER_SESSION) return { success: false, error: 'This session has used all its follow-up drafts' }
  await ctx.tools.update('sessions', g.session.recordId, { followUpDrafts: used + 1 })

  let out: { functionToDifferentiate?: string; prompt?: string; answer?: string }
  try {
    const ai = createDeepSpaceAI(ctx.env, 'anthropic') // owner-billed
    const r = await generateText({
      model: ai(CLUSTER_MODEL),
      instructions: FOLLOW_UP_INSTRUCTIONS,
      prompt: buildFollowUpPrompt({
        problemPrompt: g.parent.data.prompt,
        answerKey: g.key.data.answer,
        label: g.cluster.data.label,
        explanation: g.cluster.data.explanation ?? '',
      }),
      output: Output.object({ schema: followUpOutputSchema }),
      maxOutputTokens: 400,
      abortSignal: AbortSignal.timeout(30_000),
    })
    out = r.output
  } catch {
    return { success: false, error: 'Could not write a follow-up, try again' }
  }

  const students = g.studentIds.length
  if (out.functionToDifferentiate) {
    const built = derivativeProblem(out.functionToDifferentiate)
    if (built) return { success: true, data: { ...built, verified: true, students } }
  }
  if (out.prompt && out.answer && keyKind(out.answer)) {
    return { success: true, data: { prompt: out.prompt.slice(0, MAX_PROMPT), answer: out.answer, verified: false, students } }
  }
  return { success: false, error: 'Could not write a follow-up, try again' }
}

export const sendFollowUp: ActionHandler<Env> = async (ctx) => {
  const prompt = typeof ctx.params.prompt === 'string' ? ctx.params.prompt.trim() : ''
  const answer = typeof ctx.params.answer === 'string' ? ctx.params.answer.trim() : ''
  if (!prompt || prompt.length > MAX_PROMPT) return { success: false, error: 'Write the problem (under 500 characters)' }
  if (!keyKind(answer)) return { success: false, error: 'The answer key must be something the app can check (an expression, numbers, intervals or a limit)' }
  const g = await loadGroup(ctx)
  if (!g.ok) return { success: false, error: g.error }
  if (g.studentIds.length === 0) return { success: false, error: 'Nobody is in this group any more' }

  // Created by the tutor (the caller), so loadSessionProblem trusts it like any other problem.
  const problem = await ctx.tools.create('problems', {
    sessionId: g.session.recordId,
    order: g.parent.data.order,
    prompt,
    status: 'open',
    followUp: 1,
    parentProblemId: g.parent.recordId,
  })
  if (!problem.success) return { success: false, error: 'Could not send the follow-up' }
  const problemId = problem.data.recordId
  await ctx.tools.create('answerKeys', {
    problemId,
    answer,
    expectedMistakes: `A check for the misconception "${g.cluster.data.label}" from an earlier problem.`,
  })
  for (const studentId of g.studentIds) {
    await ctx.tools.create('followUps', {
      sessionId: g.session.recordId,
      problemId,
      parentProblemId: g.parent.recordId,
      label: g.cluster.data.label,
      studentId,
      tutorIds: [g.session.createdBy],
    })
  }
  return { success: true, data: { problemId, students: g.studentIds.length } }
}
