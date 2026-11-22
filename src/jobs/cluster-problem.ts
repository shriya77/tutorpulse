/**
 * `cluster-problem` background job (F9) — REQUIREMENTS Architecture §2.
 *
 *  1. Load the problem, the tutor's key + expected-mistake note, the labels
 *     already on the board, and every WRONG submission for the problem.
 *  2. Ask Claude (owner-billed, fast model) for { clusters: [...] } via
 *     structured output. Students' handwritten working (PNGs in each
 *     student's private folder) is attached as images, so the groups follow
 *     the step where the working went wrong, not only the one-line note.
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

import { generateText, Output, type ModelMessage, type UserContent } from 'ai'
import { appFiles, buildCronContext, createDeepSpaceAI } from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AnswerKeyData, ClusterData, Envelope, ProblemData, SessionData, SubmissionData } from '../actions/types'
import type { ClusterJobPayload } from '../actions/clustering-trigger'
import { buildClusterPrompt, buildRetryNote, CLUSTER_INSTRUCTIONS } from '../ai/prompts/cluster'
import { clusterOutputSchema, fallbackClusters, validateClusters, type ValidCluster } from '../lib/clusters'
import { MAX_CLUSTER_RUNS_PER_SESSION, MAX_WORK_BYTES, MAX_WORK_IMAGES_PER_RUN } from '../lib/limits'
import { isPngBytes } from '../lib/work'
import { misconceptionsFor } from '../ai/misconceptions/math2413'

export const CLUSTER_MODEL = 'claude-haiku-5-5'
/** Models the evaluation may compare; anything else falls back to CLUSTER_MODEL. */
const EVAL_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5']

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
  /** Working images sent to the model. */
  images?: number
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
    let images = 0

    if (wrong.length > 0) {
      const wrongIds = wrong.map((s) => s.recordId)
      const capped = (session.data.clusterRuns ?? 0) >= MAX_CLUSTER_RUNS_PER_SESSION
      if (capped || !key) {
        reason = capped ? 'session_ai_cap_reached' : 'no_answer_key'
      } else {
        await records.update('sessions', session.recordId, { clusterRuns: (session.data.clusterRuns ?? 0) + 1 })
        ctx.progress(0.3, 'Grouping wrong answers')
        const ai = createDeepSpaceAI(env, 'anthropic') // owner-billed: no authToken
        const library = misconceptionsFor(session.data.topic)
        const work = payload.noImages ? new Map<string, Uint8Array>() : await loadWorkImages(env, wrong)
        images = work.size
        const baseInput = {
          problemPrompt: problem.data.prompt,
          answerKey: key.data.answer,
          expectedMistakes: key.data.expectedMistakes,
          existingLabels: [...new Set(existing.map((c) => c.data.label))],
          submissions: wrong.map((s) => ({
            id: s.recordId,
            answer: s.data.answer,
            explanation: s.data.explanation ?? '',
            ...(work.has(s.recordId) ? { hasWorking: true } : {}),
          })),
        }
        // The prompt text, then each student's working image labelled with its id.
        const firstMessage = (withLibrary: boolean): UserContent => {
          const text = buildClusterPrompt(withLibrary ? { ...baseInput, topicMisconceptions: library } : baseInput)
          if (work.size === 0) return text
          const parts: Exclude<UserContent, string> = [{ type: 'text', text }]
          for (const [id, bytes] of work) {
            parts.push({ type: 'text', text: `Handwritten working for submission ${id}:` })
            parts.push({ type: 'image', image: bytes, mediaType: 'image/png' })
          }
          return parts
        }

        // One conversation: the model's answer, then a retry note naming what to fix.
        const runAttempts = async (withLibrary: boolean, maxAttempts: number) => {
          const messages: ModelMessage[] = [{ role: 'user', content: firstMessage(withLibrary) }]
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // A 3rd attempt only when the sole problem left is label length.
            if (attempt === 2 && !reason?.startsWith('label:')) return
            try {
              const r = await generateText({
                model: ai(payload.model && EVAL_MODELS.includes(payload.model) ? payload.model : CLUSTER_MODEL),
                instructions: CLUSTER_INSTRUCTIONS,
                messages,
                output: Output.object({ schema: clusterOutputSchema }),
                maxOutputTokens: 2000,
                abortSignal: AbortSignal.any([ctx.signal, AbortSignal.timeout(60_000)]),
              })
              const v = validateClusters(r.output, wrongIds)
              if (v.ok) {
                clusters = v.clusters
                source = attempt === 0 && withLibrary === library.length > 0 ? 'ai' : 'ai_retry'
                reason = undefined
                return
              }
              reason = v.reason
              const labels = (r.output?.clusters ?? []).map((c) => c.label)
              messages.push({ role: 'assistant', content: JSON.stringify(r.output) }, { role: 'user', content: buildRetryNote(v.reason, labels, wrongIds) })
            } catch (e) {
              reason = `ai_error: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`
            }
          }
        }

        await runAttempts(library.length > 0, 3)
        // The topic library improves wording but can unsettle hard problems
        // (docs/AGENT_LOG.md). If it didn't work, try once without it, the
        // path proven in the evals, before falling back to identical answers.
        if (source === 'none' && library.length > 0) await runAttempts(false, 2)
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

    const result = { problemId: problem.recordId, wrong: wrong.length, clusters: clusters.length, source, images, reason, rerun }
    console.log('[cluster-problem]', JSON.stringify(result))
    return result
  } catch (e) {
    // Never leave a problem stuck in "running": the next submission re-triggers.
    await records.update('problems', problem.recordId, { clusterState: 'idle' }).catch(() => undefined)
    throw e
  }
}

/**
 * Students' working images for this run: newest revisions first, at most
 * MAX_WORK_IMAGES_PER_RUN. Each file is read from ITS OWN student's private
 * folder (a key pointing anywhere else is refused by appFiles) and must be a
 * small PNG. A missing or bad file just means that student is grouped from
 * their typed answer, as before.
 */
async function loadWorkImages(env: Env, wrong: Envelope<SubmissionData>[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>()
  const withWork = wrong
    .filter((s) => s.data.workKey)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, MAX_WORK_IMAGES_PER_RUN)
  await Promise.all(
    withWork.map(async (s) => {
      try {
        const res = await appFiles(env, { scope: 'self', userId: s.data.studentId }).download(s.data.workKey!)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength <= MAX_WORK_BYTES && isPngBytes(bytes)) out.set(s.recordId, bytes)
      } catch {
        // grouped from the typed answer only
      }
    }),
  )
  return out
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
