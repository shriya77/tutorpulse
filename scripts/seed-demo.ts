/**
 * DEV-ONLY: create the demo session "Calc I — Chain Rule Review" with its 3
 * chain-rule problems and answer keys on the deployed app.
 *
 *   node scripts/seed-demo.ts
 *
 * It is not an app endpoint. It drives the app's existing RBAC-enforced
 * record tools through the DeepSpace CLI (`npx deepspace agent invoke`), as
 * whoever is logged in to the CLI — so that account becomes the demo's tutor,
 * and it can only create rows that account could create in the browser.
 * The session is created as a draft; open it from the UI to get a join code.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEMO_PROBLEMS, DEMO_TITLE } from '../tests/fixtures/chain-rule-demo.ts'

const APP = process.env.DEEPSPACE_APP ?? 'tutorpulse'
const dir = mkdtempSync(join(tmpdir(), 'tutorpulse-seed-'))

function create(collection: string, data: Record<string, unknown>): string {
  const file = join(dir, 'input.json')
  writeFileSync(file, JSON.stringify({ collection, data }))
  const out = execFileSync('npx', ['deepspace', 'agent', 'invoke', APP, 'records_create', '--input-file', file, '--json'], {
    encoding: 'utf8',
  })
  const body = JSON.parse(out.trim().split('\n').at(-1)!) as {
    ok: boolean
    result?: { success?: boolean; data?: { recordId?: string }; recordId?: string; error?: string }
    error?: string
  }
  const recordId = body.result?.data?.recordId ?? body.result?.recordId
  if (!body.ok || !recordId) throw new Error(`create ${collection} failed: ${out.slice(0, 300)}`)
  return recordId
}

try {
  const sessionId = create('sessions', { title: DEMO_TITLE })
  for (const [i, p] of DEMO_PROBLEMS.entries()) {
    const problemId = create('problems', { sessionId, order: i + 1, prompt: p.prompt })
    create('answerKeys', { problemId, answer: p.answer, expectedMistakes: p.mistakes })
  }
  console.log(`Created "${DEMO_TITLE}" with ${DEMO_PROBLEMS.length} problems: /sessions/${sessionId}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
