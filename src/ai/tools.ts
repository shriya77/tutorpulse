/**
 * AI tools for the in-app hint assistant and the local agent (one definition
 * for both surfaces, registered once via `registerAgent` in worker.ts).
 *
 * The in-app HINT ASSISTANT (/api/ai/chat) is READ-ONLY: it only gets
 * READ_TOOL_NAMES. The browser/CLI agent surfaces (/_deepspace/agent/*) also
 * get the record write tools; they run as the calling user under the same
 * per-collection RBAC as that user's own WebSocket writes, so they add no
 * power, and the privacy tests (T4, T5) use them to prove forbidden writes
 * are refused. Every tool runs as the caller, so RBAC decides what it sees
 * (a student gets no answer keys, clusters or other students' work).
 *
 * Two custom tools ground hints in the live session: `get_current_problem`
 * and `search_notes`. Neither takes a session id: the server derives the
 * caller's live session itself, so a student cannot aim them elsewhere.
 */

import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod/v4'
import { BUILT_IN_TOOLS, applyAiToolDefaults, knowledge } from 'deepspace/worker'
import type { AgentToolContext, ToolSchema } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { ProblemData } from '../actions/types'
import { findActiveSession, queryRecords } from '../server/owner-records'

type ToolExecutor = (toolName: string, params: Record<string, unknown>) => Promise<unknown>

const READ_TOOL_NAMES = ['schema.list', 'schema.describe', 'records.query', 'records.get', 'user.current']
const WRITE_TOOL_NAMES = ['records.create', 'records.update', 'records.delete']

/** The hint assistant's chat route never gets write tools (F13). */
function isHintChat(context?: AgentToolContext<Env>): boolean {
  if (!context) return true // no request context: be conservative
  return new URL(context.request.url).pathname.startsWith('/api/ai/')
}

// ============================================================================
// Tool definitions
// ============================================================================

export function buildTools(executor: ToolExecutor, context?: AgentToolContext<Env>): ToolSet {
  const tools: ToolSet = context ? buildHintTools(context) : {}
  const allowed = isHintChat(context) ? READ_TOOL_NAMES : [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES]

  for (const def of BUILT_IN_TOOLS) {
    if (!allowed.includes(def.name)) continue
    const safeName = def.name.replace('.', '_')
    tools[safeName] = tool({
      description: def.description,
      inputSchema: buildInputSchema(def),
      // Apply assistant-only param defaults (e.g. records.query page size) here
      // in the AI tool layer, so internal record readers that hit the tools
      // dispatch directly stay unbounded.
      execute: async (params: Record<string, unknown>) =>
        executor(def.name, applyAiToolDefaults(def.name, params)),
    })
  }

  return tools
}

// ============================================================================
// Hint tools (F13)
// ============================================================================

const NOT_IN_SESSION = { error: 'You are not in a live TutorPulse session right now.' }

function buildHintTools(context: AgentToolContext<Env>): ToolSet {
  const { env, userId } = context
  return {
    get_current_problem: tool({
      description: 'Get the problem the tutor is currently showing in your live session (prompt in LaTeX), plus the topic on the board if any. Never includes the answer.',
      inputSchema: z.object({}),
      execute: async () => {
        const active = await findActiveSession(env, userId)
        if (!active) return NOT_IN_SESSION
        const { session } = active
        const problems = (await queryRecords<ProblemData>(env, 'problems', { sessionId: session.recordId }))
          .filter((p) => p.createdBy === session.createdBy)
          .sort((a, b) => a.data.order - b.data.order)
        const index = problems.findIndex((p) => p.recordId === session.data.currentProblemId)
        if (index < 0) return { session: session.data.title, message: 'The tutor has not shown a problem yet.' }
        return {
          session: session.data.title,
          problemNumber: index + 1,
          prompt: problems[index].data.prompt,
          topicOnBoard: session.data.focusLabel || null,
        }
      },
    }),
    search_notes: tool({
      description: "Search the tutor's uploaded notes for this session. Use it to ground hints in the tutor's own explanations.",
      inputSchema: z.object({ query: z.string().min(2).max(300).describe('What to look up, e.g. "chain rule inner function"') }),
      execute: async ({ query }: { query: string }) => {
        const active = await findActiveSession(env, userId)
        if (!active) return NOT_IN_SESSION
        try {
          const found = await knowledge(env).scoped({ folder: active.session.recordId }).search(query, { mode: 'hybrid', limit: 5 })
          if (found.chunks.length === 0) return { results: [], note: 'No matching notes (the tutor may not have uploaded any).' }
          return { results: found.chunks.map((c) => ({ source: c.filename ?? 'notes', text: c.text.slice(0, 1200) })) }
        } catch {
          return { results: [], note: 'Notes are not available right now.' }
        }
      },
    }),
  }
}

// ============================================================================
// Convert ToolSchema params → Zod validator + derived provider JSON Schema
// ============================================================================

/**
 * The Zod validator is the single source; the provider-facing JSON Schema is
 * derived from it with Zod's native conversion, which keeps z.record()
 * objects open (`additionalProperties: {}`). The AI SDK's own Zod conversion
 * closes every object, which would incorrectly advertise the free-form
 * `data` and `where` objects as empty — so the conversion happens here.
 */
function buildInputSchema(def: ToolSchema) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [name, param] of Object.entries(def.params)) {
    let s: z.ZodTypeAny
    switch (param.type) {
      case 'string':
        s = z.string()
        break
      case 'number':
        s = z.number()
        break
      case 'boolean':
        s = z.boolean()
        break
      case 'object':
        s = z.record(z.string(), z.unknown())
        break
      case 'array':
        s = z.array(z.unknown())
        break
    }
    if (param.description) s = s.describe(param.description)
    if (!param.required) s = s.optional()
    shape[name] = s
  }

  const validator = z.object(shape)
  return jsonSchema<Record<string, unknown>>(
    z.toJSONSchema(validator) as Parameters<typeof jsonSchema>[0],
    {
      validate: async (value) => {
        const result = await validator.safeParseAsync(value)
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error }
      },
    },
  )
}
