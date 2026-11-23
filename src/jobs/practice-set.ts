/**
 * `practice-set` background job (F15) — REQUIREMENTS Architecture §5.
 *
 *  1. Build a summary (problems, correct rates, top clusters with example
 *     wrong answers) with NO student names or ids.
 *  2. LaTeX path (default): Claude writes 2–3 new problems per top
 *     misconception as structured data; mathjs works out (or checks) every
 *     derivative answer; `src/lib/practiceLatex.ts` builds the document with
 *     a pgfplots chart of the exact correct rates; the DeepSpace
 *     `latex-compiler` integration compiles it.
 *     Fallback: if that fails, Claude writes the PDF with Python in the
 *     Anthropic sandbox (the original path).
 *  3. Store the PDF in the tutor's private files (`appFiles`, scope 'self')
 *     and mark the row ready.
 * Progress is mirrored onto the `practiceSets` row so the tutor sees it live
 * (the job room itself is admin-only).
 */

import { generateText, isStepCount, Output, streamText } from 'ai'
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
import {
  buildPracticeContentPrompt,
  PRACTICE_CONTENT_INSTRUCTIONS,
  PRACTICE_SET_FILENAME,
  PRACTICE_SET_TASK,
  practiceContentSchema,
  type PracticeContent,
} from '../ai/prompts/practice-set'
import { checkAnswer, derivativeProblem, expressionTex } from '../lib/answerCheck'
import { buildPracticeLatex, isSafeMath, type PracticeSection } from '../lib/practiceLatex'
import { OTHER_LABEL } from '../lib/clusters'

export const PRACTICE_SET_MODEL = 'claude-sonnet-5-5'

type Cron = ReturnType<typeof buildCronContext>
type Records = Cron['records']
type Summary = ReturnType<typeof buildPracticeSummary>
type Progress = (value: number, message: string) => Promise<void>

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

/**
 * Turns the model's structured content into safe document sections. Derivative
 * questions are written by mathjs, and the model's answer is kept only if it
 * checks out against mathjs's own derivative (otherwise mathjs's is used).
 * Anything that isn't safe LaTeX is dropped. Exported for unit testing.
 */
export function toPracticeSections(content: PracticeContent): PracticeSection[] {
  const sections: PracticeSection[] = []
  for (const sec of content.sections.slice(0, 3)) {
    const problems: PracticeSection['problems'] = []
    for (const p of sec.problems.slice(0, 3)) {
      if (p.functionToDifferentiate) {
        const d = derivativeProblem(p.functionToDifferentiate)
        if (!d) continue
        const own = p.derivative && checkAnswer(p.derivative, d.answer).verdict === 'correct' ? expressionTex(p.derivative) : null
        const answer = own ?? expressionTex(d.answer)
        if (!answer || !isSafeMath(d.prompt) || !isSafeMath(answer)) continue
        problems.push({ instruction: 'Find', math: d.prompt, answer, verified: true })
      } else if (p.answer && isSafeMath(p.answer) && (p.math ? isSafeMath(p.math) : p.instruction)) {
        problems.push({ instruction: p.instruction ?? '', math: p.math ?? '', answer: p.answer, verified: false })
      }
    }
    if (problems.length) sections.push({ label: sec.label, watchFor: sec.watchFor, problems })
  }
  return sections
}

interface CompileResult {
  compiled: boolean
  pdfBase64?: string | null
  error?: string
}

async function latexPdf(env: Env, cron: Cron, summary: Summary, signal: AbortSignal, progress: Progress): Promise<Blob> {
  await progress(0.25, 'Writing new problems…')
  const ai = createDeepSpaceAI(env, 'anthropic') // owner-billed
  const { output } = await generateText({
    model: ai(PRACTICE_SET_MODEL),
    instructions: PRACTICE_CONTENT_INSTRUCTIONS,
    prompt: buildPracticeContentPrompt(summary),
    output: Output.object({ schema: practiceContentSchema }),
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(3 * 60 * 1000)]),
  })
  const sections = toPracticeSections(output)
  if (!sections.length) throw new Error('No usable problems came back')

  await progress(0.6, 'Typesetting the PDF…')
  const document = buildPracticeLatex({
    title: summary.title,
    rates: summary.problems.map((p) => ({ number: p.number, correctRate: p.correctRate })),
    sections,
  })
  const result = (await cron.integrations.call('latex-compiler/compile', { compiler: 'pdflatex', document })) as CompileResult
  if (!result?.compiled || !result.pdfBase64) throw new Error(`LaTeX did not compile: ${(result?.error ?? 'no PDF').slice(0, 120)}`)
  const bytes = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('The compiler did not return a PDF')
  const verified = sections.flatMap((s) => s.problems).filter((p) => p.verified).length
  console.log('[practice-set] latex ok', JSON.stringify({ sections: sections.length, verifiedAnswers: verified }))
  return new Blob([bytes], { type: 'application/pdf' })
}

/** The original path, kept as the fallback: Claude writes the PDF with Python in the Anthropic sandbox. */
async function sandboxPdf(env: Env, summary: Summary, signal: AbortSignal, progress: Progress): Promise<Blob> {
  const files = sandboxFiles(env) // owner-billed, owner's sandbox scope
  const cleanup: string[] = []
  try {
    const uploaded = await files.upload(new File([JSON.stringify(summary, null, 1)], 'summary.json', { type: 'application/json' }), {
      expiresInSeconds: 3600,
    })
    cleanup.push(uploaded.id)

    await progress(0.3, 'Writing new problems (backup method)…')
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
    return pdf
  } finally {
    for (const id of cleanup) await files.delete(id).catch(() => undefined)
  }
}

export async function runPracticeSetJob(payload: PracticeSetJobPayload, ctx: JobContext, env: Env): Promise<unknown> {
  if (!env.OWNER_USER_ID) throw new Error('OWNER_USER_ID is not set')
  const cron = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const { records } = cron
  const set = await one<PracticeSetData>(records, 'practiceSets', payload.practiceSetId)
  if (!set) return { skipped: 'practice_set_gone' }

  const progress: Progress = async (value, message) => {
    ctx.progress(value, message)
    await records.update('practiceSets', set.recordId, { progressMessage: message })
  }

  try {
    const session = await one<SessionData>(records, 'sessions', set.data.sessionId)
    if (!session || session.createdBy !== set.data.tutorId) throw new Error('Session not found')
    const tutorId = session.createdBy

    await progress(0.1, 'Summarising the session…')
    const problems = ((await records.query('problems', { where: { sessionId: session.recordId } })) as Envelope<ProblemData>[])
      .filter((p) => p.createdBy === tutorId && p.data.followUp !== 1)
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
    let pdf: Blob
    let method = 'latex'
    try {
      pdf = await latexPdf(env, cron, summary, signal, progress)
    } catch (e) {
      signal.throwIfAborted()
      console.warn('[practice-set] latex path failed, using the sandbox', e instanceof Error ? e.message.slice(0, 160) : 'unknown')
      method = 'sandbox'
      pdf = await sandboxPdf(env, summary, signal, progress)
    }

    await progress(0.9, 'Saving…')
    const stored = await appFiles(env, { scope: 'self', userId: tutorId }).upload(
      new Blob([await pdf.arrayBuffer()], { type: 'application/pdf' }),
      { key: `practice-sets/${session.recordId}/${set.recordId}.pdf`, name: 'practice-set.pdf' },
    )
    await records.update('practiceSets', set.recordId, { status: 'ready', fileKey: stored.key, progressMessage: '' })
    const done = { practiceSetId: set.recordId, bytes: pdf.size, misconceptions: summary.misconceptions.length, method }
    console.log('[practice-set] ok', JSON.stringify(done))
    return done
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 160) : 'unknown error'
    console.error('[practice-set] failed', message)
    await records.update('practiceSets', set.recordId, { status: 'failed', progressMessage: `Failed: ${message}` }).catch(() => undefined)
    return { failed: message }
  }
}
