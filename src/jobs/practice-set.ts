/**
 * `practice-set` background job (F15) — REQUIREMENTS Architecture §5.
 *
 *  1. Build a summary (problems, correct rates, top clusters with example
 *     wrong answers) with NO student names or ids.
 *  2. Upload it to the sandbox and have Claude write a PDF with 2–3 new
 *     problems per top misconception, an answers page and a correct-rate chart.
 *  3. Download the PDF, store it in the tutor's private files (`appFiles`,
 *     scope 'self'), mark the row ready, and delete the sandbox files.
 * Progress is mirrored onto the `practiceSets` row so the tutor sees it live
 * (the job room itself is admin-only).
 */

import { isStepCount, streamText } from 'ai'
import {
  appFiles,
  buildCronContext,
  codeExecutionTool,
  createDeepSpaceAI,
  forwardSandboxContainer,
  sandboxFiles,
  sandboxOutputs,
  sandboxUpload,
} from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { PracticeSetJobPayload } from '../actions/practice-set-actions'
import type { ClusterData, Envelope, PracticeSetData, ProblemData, SessionData, SubmissionData } from '../actions/types'
import { PRACTICE_SET_FILENAME, PRACTICE_SET_TASK } from '../ai/prompts/practice-set'
import { OTHER_LABEL } from '../lib/clusters'

export const PRACTICE_SET_MODEL = 'claude-sonnet-5-5'

type Records = ReturnType<typeof buildCronContext>['records']

async function one<T>(records: Records, collection: string, recordId: string): Promise<Envelope<T> | null> {
  const rows = (await records.query(collection, { where: { recordId }, limit: 1 })) as Envelope<T>[]
  return rows[0] ?? null
}

/** The anonymized summary handed to the sandbox. Exported for unit testing. */
export function buildPracticeSummary(
  session: Envelope<SessionData>,
  problems: Envelope<ProblemData>[],
  answers: Map<string, string>,
  submissions: Envelope<SubmissionData>[],
  clusters: Envelope<ClusterData>[],
) {
  const ordered = [...problems].sort((a, b) => a.data.order - b.data.order)
  const numberOf = new Map(ordered.map((p, i) => [p.recordId, i + 1]))
  const answerText = new Map(submissions.map((s) => [s.recordId, s.data.answer]))
  return {
    title: session.data.title,
    problems: ordered.map((p, i) => {
      const subs = submissions.filter((s) => s.data.problemId === p.recordId)
      const correct = subs.filter((s) => s.data.isCorrect === 1).length
      return {
        number: i + 1,
        prompt: p.data.prompt,
        answer: answers.get(p.recordId) ?? '',
        submitted: subs.length,
        correct,
        correctRate: subs.length ? Math.round((correct / subs.length) * 100) / 100 : null,
      }
    }),
    misconceptions: clusters
      .filter((c) => c.data.label !== OTHER_LABEL && numberOf.has(c.data.problemId))
      .sort((a, b) => b.data.count - a.data.count)
      .slice(0, 3)
      .map((c) => ({
        label: c.data.label,
        explanation: c.data.explanation,
        students: c.data.count,
        problemNumber: numberOf.get(c.data.problemId),
        exampleWrongAnswers: [...new Set((c.data.submissionIds ?? []).map((id) => answerText.get(id)).filter(Boolean))].slice(0, 3),
      })),
  }
}

export async function runPracticeSetJob(payload: PracticeSetJobPayload, ctx: JobContext, env: Env): Promise<unknown> {
  if (!env.OWNER_USER_ID) throw new Error('OWNER_USER_ID is not set')
  const { records } = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const set = await one<PracticeSetData>(records, 'practiceSets', payload.practiceSetId)
  if (!set) return { skipped: 'practice_set_gone' }

  const progress = async (value: number, message: string) => {
    ctx.progress(value, message)
    await records.update('practiceSets', set.recordId, { progressMessage: message })
  }

  const files = sandboxFiles(env) // owner-billed, owner's sandbox scope
  const cleanup: string[] = []
  try {
    const session = await one<SessionData>(records, 'sessions', set.data.sessionId)
    if (!session || session.createdBy !== set.data.tutorId) throw new Error('Session not found')
    const tutorId = session.createdBy

    await progress(0.1, 'Summarising the session…')
    const problems = ((await records.query('problems', { where: { sessionId: session.recordId } })) as Envelope<ProblemData>[])
      .filter((p) => p.createdBy === tutorId)
    const keys = new Map<string, string>()
    for (const p of problems) {
      const ks = (await records.query('answerKeys', { where: { problemId: p.recordId } })) as Envelope<{ answer: string }>[]
      const k = ks.find((x) => x.createdBy === tutorId)
      if (k) keys.set(p.recordId, k.data.answer)
    }
    const submissions = (await records.query('submissions', { where: { sessionId: session.recordId } })) as Envelope<SubmissionData>[]
    const clusters = (await records.query('clusters', { where: { sessionId: session.recordId } })) as Envelope<ClusterData>[]
    const summary = buildPracticeSummary(session, problems, keys, submissions, clusters)

    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(12 * 60 * 1000)])
    const uploaded = await files.upload(new File([JSON.stringify(summary, null, 1)], 'summary.json', { type: 'application/json' }), {
      expiresInSeconds: 3600,
    })
    cleanup.push(uploaded.id)

    await progress(0.25, 'Writing new problems…')
    const ai = createDeepSpaceAI(env, 'anthropic')
    const result = streamText({
      model: ai(PRACTICE_SET_MODEL),
      tools: { code_execution: codeExecutionTool() },
      prepareStep: forwardSandboxContainer,
      stopWhen: isStepCount(16),
      abortSignal: signal,
      messages: [{ role: 'user', content: [{ type: 'text', text: PRACTICE_SET_TASK }, sandboxUpload(uploaded)] }],
    })
    let toolCalls = 0
    for await (const part of result.stream) {
      if (part.type === 'error') throw part.error
      if (part.type === 'tool-call' && ++toolCalls === 2) await progress(0.6, 'Rendering the PDF…')
    }
    signal.throwIfAborted()

    const outputs = sandboxOutputs(await result.steps)
    cleanup.push(...outputs.fileIds)
    let pdf: Blob | null = null
    for (const id of outputs.fileIds) {
      const meta = await files.get(id)
      if (meta.filename.toLowerCase().endsWith('.pdf') && (!pdf || meta.filename === PRACTICE_SET_FILENAME)) {
        pdf = await (await files.download(id)).blob()
      }
    }
    if (!pdf) throw new Error('The sandbox did not produce a PDF')

    await progress(0.9, 'Saving…')
    const stored = await appFiles(env, { scope: 'self', userId: tutorId }).upload(
      new Blob([await pdf.arrayBuffer()], { type: 'application/pdf' }),
      { key: `practice-sets/${session.recordId}/${set.recordId}.pdf`, name: 'practice-set.pdf' },
    )
    await records.update('practiceSets', set.recordId, { status: 'ready', fileKey: stored.key, progressMessage: '' })
    const done = { practiceSetId: set.recordId, bytes: pdf.size, misconceptions: summary.misconceptions.length }
    console.log('[practice-set] ok', JSON.stringify(done))
    return done
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 160) : 'unknown error'
    console.error('[practice-set] failed', message)
    await records.update('practiceSets', set.recordId, { status: 'failed', progressMessage: `Failed: ${message}` }).catch(() => undefined)
    return { failed: message }
  } finally {
    for (const id of cleanup) await files.delete(id).catch(() => undefined)
  }
}
