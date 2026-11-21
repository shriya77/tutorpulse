/**
 * Phase 0 spike tools (temporary). Owner-only local-agent tools that exercise
 * the AI proxy and the sandbox job. See src/spikes/README.md.
 */

import { generateText, Output, tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod'
import { AgentToolError, appFiles, createDeepSpaceAI, enqueueJob } from 'deepspace/worker'
import type { AgentToolContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import { SPIKE_PDF_KEY, SPIKE_SANDBOX_JOB } from './sandbox-pdf-job'

/** The fast model we expect to use for clustering. Confirmed against listDeepSpaceAgentModels(). */
const SPIKE_MODEL = 'claude-haiku-5-5'

const clusterSchema = z.object({
  clusters: z.array(
    z.object({
      label: z.string(),
      explanation: z.string(),
      submissionIds: z.array(z.string()),
    }),
  ),
})

// Fake wrong answers to d/dx sin(3x^2) — no real student data.
const FAKE_WRONG = [
  { id: 's1', answer: 'cos(3x^2)', explanation: 'derivative of sin is cos' },
  { id: 's2', answer: 'cos(3x^2)', explanation: 'sin -> cos' },
  { id: 's3', answer: '6x*cos(x^2)', explanation: 'took derivative of the inside' },
  { id: 's4', answer: '-cos(3x^2)*6x', explanation: 'chain rule, derivative of sin is -cos' },
]

const PROMPT = [
  'Problem: d/dx sin(3x^2). Correct answer: 6x*cos(3x^2).',
  'Group these wrong answers by the misconception behind them. Labels must be 6 words or fewer.',
  'Every submission id must appear in exactly one cluster.',
  JSON.stringify(FAKE_WRONG),
].join('\n')

function requireOwner(context: AgentToolContext<Env>): void {
  if (!context.env.OWNER_USER_ID || context.userId !== context.env.OWNER_USER_ID) {
    throw new AgentToolError('forbidden', 'Spike tools are owner-only.', 403)
  }
}

export function buildSpikeTools(context: AgentToolContext<Env>): ToolSet {
  const env = context.env
  return {
    spike_generate_json: tool({
      description: 'Phase 0 spike A (owner only): ask Claude for cluster JSON two ways and report what came back.',
      inputSchema: z.object({}),
      execute: async () => {
        requireOwner(context)
        // Owner-billed: no authToken, so the proxy uses APP_OWNER_JWT.
        const ai = createDeepSpaceAI(env, 'anthropic')

        const t0 = Date.now()
        let structured: unknown = null
        let structuredError: string | null = null
        try {
          const r = await generateText({
            model: ai(SPIKE_MODEL),
            output: Output.object({ schema: clusterSchema }),
            prompt: PROMPT,
            maxOutputTokens: 1024,
          })
          structured = r.output
        } catch (e) {
          structuredError = e instanceof Error ? e.message : String(e)
        }
        const structuredMs = Date.now() - t0

        const t1 = Date.now()
        let plainText = ''
        let plainParsed: unknown = null
        let plainParseError: string | null = null
        try {
          const r = await generateText({
            model: ai(SPIKE_MODEL),
            prompt: `${PROMPT}\nReply with only a JSON object of the form {"clusters":[{"label":"","explanation":"","submissionIds":[]}]} and nothing else.`,
            maxOutputTokens: 1024,
          })
          plainText = r.text
          plainParsed = clusterSchema.parse(JSON.parse(r.text))
        } catch (e) {
          plainParseError = e instanceof Error ? e.message : String(e)
        }
        const plainMs = Date.now() - t1

        return {
          model: SPIKE_MODEL,
          structured: { ok: structuredError === null, ms: structuredMs, value: structured, error: structuredError },
          plain: { ok: plainParseError === null, ms: plainMs, value: plainParsed, rawText: plainText.slice(0, 2000), error: plainParseError },
        }
      },
    }),

    spike_sandbox_enqueue: tool({
      description: 'Phase 0 spike B (owner only): enqueue the sandbox PDF background job.',
      inputSchema: z.object({}),
      execute: async () => {
        requireOwner(context)
        const jobId = await enqueueJob(
          env.JOB_ROOMS,
          `app:${env.DEEPSPACE_APP_ID}`,
          SPIKE_SANDBOX_JOB,
          {},
          { maxAttempts: 1, enqueuedBy: context.userId },
        )
        return { jobId }
      },
    }),

    spike_sandbox_result: tool({
      description: 'Phase 0 spike B (owner only): check whether the sandbox job stored its PDF.',
      inputSchema: z.object({}),
      execute: async () => {
        requireOwner(context)
        const files = appFiles(env, { scope: 'self', userId: context.userId })
        const listing = await files.list({ prefix: 'spikes/' })
        try {
          const res = await files.download(SPIKE_PDF_KEY)
          const bytes = new Uint8Array(await res.arrayBuffer())
          const magic = new TextDecoder().decode(bytes.slice(0, 5))
          return { found: true, key: SPIKE_PDF_KEY, bytes: bytes.length, isPdf: magic === '%PDF-', listing }
        } catch (e) {
          return { found: false, error: e instanceof Error ? e.message : String(e), listing }
        }
      },
    }),
  }
}
