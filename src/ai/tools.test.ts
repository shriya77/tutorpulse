import { describe, expect, it } from 'vitest'
import type { AgentToolContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import { buildTools } from './tools'

const ctx = (path: string) => ({ env: {} as Env, userId: 'u', request: new Request(`https://x.test${path}`) }) as AgentToolContext<Env>
const noop = async () => ({})

describe('buildTools', () => {
  it('gives the hint assistant (chat route) read tools only', () => {
    const names = Object.keys(buildTools(noop, ctx('/api/ai/chat')))
    expect(names).toEqual(expect.arrayContaining(['records_query', 'records_get', 'get_current_problem', 'search_notes']))
    for (const t of ['records_create', 'records_update', 'records_delete', 'sessionReport']) expect(names).not.toContain(t)
  })

  it('is read-only when there is no request context', () => {
    expect(Object.keys(buildTools(noop))).not.toContain('records_create')
  })

  it('keeps RBAC-enforced write tools on the agent tool routes', () => {
    const names = Object.keys(buildTools(noop, ctx('/_deepspace/agent/browser/tools/records_create')))
    expect(names).toEqual(expect.arrayContaining(['records_create', 'records_update', 'records_delete', 'sessionReport']))
  })
})
