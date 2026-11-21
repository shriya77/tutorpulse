/**
 * Phase 0 spike B (temporary): a background job that has Claude write a
 * one-page PDF with a matplotlib chart in the Anthropic sandbox, then stores
 * it with appFiles and deletes the sandbox copy.
 */

import { isStepCount, streamText } from 'ai'
import {
  appFiles,
  codeExecutionTool,
  createDeepSpaceAI,
  forwardSandboxContainer,
  sandboxFiles,
  sandboxOutputs,
} from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'

export const SPIKE_SANDBOX_JOB = 'spike-sandbox-pdf'
export const SPIKE_PDF_KEY = 'spikes/sandbox-test.pdf'

const TASK = [
  'Using Python, create a one-page PDF named practice-test.pdf.',
  'Title: "TutorPulse sandbox spike". Below it, a matplotlib bar chart of correct-rate per problem',
  'for problems P1=0.25, P2=0.6, P3=0.9, then one practice problem: "Differentiate cos(5x^3)".',
  'Save it into $OUTPUT_DIR and list $OUTPUT_DIR in the same bash command.',
].join(' ')

export async function runSandboxPdfSpike(ctx: JobContext, env: Env): Promise<unknown> {
  if (!env.OWNER_USER_ID) throw new Error('OWNER_USER_ID is not set')
  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(10 * 60 * 1000)])

  // Owner-billed (no authToken). Default 'user' sandbox scope = the owner's files.
  const ai = createDeepSpaceAI(env, 'anthropic')
  const files = sandboxFiles(env)

  ctx.progress(0.1, 'Running code in the sandbox…')
  const result = streamText({
    model: ai('claude-sonnet-5-5'),
    tools: { code_execution: codeExecutionTool() },
    prepareStep: forwardSandboxContainer,
    stopWhen: isStepCount(12),
    abortSignal: signal,
    messages: [{ role: 'user', content: TASK }],
  })
  for await (const part of result.stream) {
    if (part.type === 'error') throw part.error
  }
  signal.throwIfAborted()

  const outputs = sandboxOutputs(await result.steps)
  if (outputs.fileIds.length === 0) throw new Error('Sandbox produced no output files')

  ctx.progress(0.7, 'Saving the PDF…')
  const store = appFiles(env, { scope: 'self', userId: env.OWNER_USER_ID })
  const saved: { fileId: string; filename: string; bytes: number }[] = []
  for (const fileId of outputs.fileIds) {
    const meta = await files.get(fileId)
    if (meta.filename.toLowerCase().endsWith('.pdf')) {
      const blob = await (await files.download(fileId)).blob()
      await store.upload(blob, { key: SPIKE_PDF_KEY, name: meta.filename })
      saved.push({ fileId, filename: meta.filename, bytes: blob.size })
    }
    await files.delete(fileId)
  }
  if (saved.length === 0) throw new Error('Sandbox produced files, but none was a PDF')

  ctx.progress(1, 'Done')
  const summary = { key: SPIKE_PDF_KEY, saved, outputCount: outputs.fileIds.length }
  console.log('[spike-sandbox-pdf] ok', JSON.stringify(summary))
  return summary
}
