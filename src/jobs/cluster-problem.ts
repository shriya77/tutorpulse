/**
 * `cluster-problem` background job (F9) — REQUIREMENTS Architecture §2.
 *
 *  1. Load the problem, the tutor's key + expected-mistake note, the labels
 *     already on the board, and every WRONG submission for the problem.
 *  2. Ask Claude (owner-billed, fast model) for { clusters: [...] } via
 *     structured output.
 *  3. Validate with src/lib/clusters.ts; on failure retry once with the
 *     reason; then fall back to grouping identical answers.
 *  4. Replace the problem's cluster rows (update in place by label, so the
 *     board doesn't flicker), readable only by the tutor.
 *  5. If new submissions arrived meanwhile (`clusterState === 'dirty'`),
 *     return { rerun: true } and AppJobRoom enqueues one more run.
 *
 * Runs as the app owner with RBAC off (buildCronContext), so it reads only
 * rows tied to this problem and writes only `clusters` + `problems.clusterState`
 * + the session's AI counter.
 */

import { generateText, Output } from 'ai'
import { buildCronContext, createDeepSpaceAI } from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AnswerKeyData, ClusterData, Envelope, ProblemData, SessionData, SubmissionData } from '../actions/types'
import type { ClusterJobPayload } from '../actions/clustering-trigger'
import { buildClusterPrompt, buildRetryNote, CLUSTER_INSTRUCTIONS } from '../ai/prompts/cluster'
import { clusterOutputSchema, fallbackClusters, validateClusters, type ValidCluster } from '../lib/clusters'
import { MAX_CLUSTER_RUNS_PER_SESSION } from '../lib/limits'

export const CLUSTER_MODEL = 'claude-haiku-5-5'

type Records = ReturnType<typeof buildCronContext>['records']

async function one<T>(records: Records, collection: string, recordId: string): Promise<Envelope<T> | null> {
  const rows = (await records.query(collection, { where: { recordId }, limit: 1 })) as Envelope<T>[]
  return rows[0] ?? null
}

export interface ClusterJobResult {
  problemId: string
  wrong: number
  clusters: number
  source: 'ai' | 'ai_retry' | 'fallback' | 'none'
  reason?: string
  rerun: boolean
}

export async function runClusterJob(payload: ClusterJobPayload, ctx: JobContext, env: Env): Promise<ClusterJobResult> {
  if (!env.OWNER_USER_ID) throw new Error('OWNER_USER_ID is not set')
  const { records } = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)

  const problem = await one<ProblemData>(records, 'problems', payload.problemId)
  if (!problem) return { problemId: payload.problemId, wrong: 0, clusters: 0, source: 'none', reason: 'problem_gone', rerun: false }

  try {
    const session = await one<SessionData>(records, 'sessions', problem.data.sessionId)
    // A problem not created by the session's tutor is never clustered.
    if (!session || session.createdBy !== problem.createdBy) {
      return { problemId: problem.recordId, wrong: 0, clusters: 0, source: 'none', reason: 'not_session_problem', rerun: false }
    }
    const tutorId = session.createdBy

    ctx.progress(0.1, 'Loading answers')
    const keys = (await records.query('answerKeys', { where: { problemId: problem.recordId } })) as Envelope<AnswerKeyData>[]
    const key = keys.find((k) => k.createdBy === tutorId)
    const subs = (await records.query('submissions', { where: { problemId: problem.recordId } })) as Envelope<SubmissionData>[]
    const wrong = subs.filter((s) => s.data.isCorrect !== 1 && s.data.sessionId === session.recordId)
    const existing = (await records.query('clusters', { where: { problemId: problem.recordId } })) as Envelope<ClusterData>[]

    let clusters: ValidCluster[] = []
    let source: ClusterJobResult['source'] = 'none'
    let reason: string | undefined

    if (wrong.length > 0) {
      const wrongIds = wrong.map((s) => s.recordId)
      const capped = (session.data.clusterRuns ?? 0) >= MAX_CLUSTER_RUNS_PER_SESSION
      if (capped || !key) {
        reason = capped ? 'session_ai_cap_reached' : 'no_answer_key'
      } else {
        await records.update('sessions', session.recordId, { clusterRuns: (session.data.clusterRuns ?? 0) + 1 })
        ctx.progress(0.3, 'Grouping wrong answers')
        const ai = createDeepSpaceAI(env, 'anthropic') // owner-billed: no authToken
        const prompt = buildClusterPrompt({
          problemPrompt: problem.data.prompt,
          answerKey: key.data.answer,
          expectedMistakes: key.data.expectedMistakes,
          existingLabels: [...new Set(existing.map((c) => c.data.label))],
          submissions: wrong.map((s) => ({ id: s.recordId, answer: s.data.answer, explanation: s.data.explanation ?? '' })),
        })

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: prompt }]
        for (let attempt = 0; attempt < 2 && source === 'none'; attempt++) {
          try {
            const r = await generateText({
              model: ai(CLUSTER_MODEL),
              instructions: CLUSTER_INSTRUCTIONS,
              messages,
              output: Output.object({ schema: clusterOutputSchema }),
              maxOutputTokens: 2000,
              abortSignal: AbortSignal.any([ctx.signal, AbortSignal.timeout(60_000)]),
            })
            const v = validateClusters(r.output, wrongIds)
            if (v.ok) {
              clusters = v.clusters
              source = attempt === 0 ? 'ai' : 'ai_retry'
            } else {
              reason = v.reason
              messages.push({ role: 'assistant', content: JSON.stringify(r.output) }, { role: 'user', content: buildRetryNote(v.reason) })
            }
          } catch (e) {
            reason = `ai_error: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`
          }
        }
      }
      if (source === 'none') {
        clusters = fallbackClusters(wrong.map((s) => ({ id: s.recordId, answer: s.data.answer })))
        source = 'fallback'
      }
    }

    ctx.progress(0.8, 'Updating the board')
    await replaceClusters(records, existing, clusters, { sessionId: session.recordId, problemId: problem.recordId, tutorId })

    // Debounce: if answers arrived while we ran, run once more.
    const latest = await one<ProblemData>(records, 'problems', problem.recordId)
    const rerun = latest?.data.clusterState === 'dirty'
    await records.update('problems', problem.recordId, { clusterState: rerun ? 'running' : 'idle' })

    const result = { problemId: problem.recordId, wrong: wrong.length, clusters: clusters.length, source, reason, rerun }
    console.log('[cluster-problem]', JSON.stringify(result))
    return result
  } catch (e) {
    // Never leave a problem stuck in "running": the next submission re-triggers.
    await records.update('problems', problem.recordId, { clusterState: 'idle' }).catch(() => undefined)
    throw e
  }
}

/** Update rows whose label survives, create new ones, delete stale ones. */
async function replaceClusters(
  records: Records,
  existing: Envelope<ClusterData>[],
  next: ValidCluster[],
  scope: { sessionId: string; problemId: string; tutorId: string },
): Promise<void> {
  const byLabel = new Map(existing.map((c) => [c.data.label, c]))
  const kept = new Set<string>()
  for (const c of next) {
    const data = {
      sessionId: scope.sessionId,
      problemId: scope.problemId,
      label: c.label,
      explanation: c.explanation,
      count: c.submissionIds.length,
      submissionIds: c.submissionIds,
      tutorIds: [scope.tutorId],
    }
    const row = byLabel.get(c.label)
    if (row && !kept.has(row.recordId)) {
      kept.add(row.recordId)
      await records.update('clusters', row.recordId, data)
    } else {
      await records.create('clusters', data)
    }
  }
  for (const row of existing) if (!kept.has(row.recordId)) await records.delete('clusters', row.recordId)
}
