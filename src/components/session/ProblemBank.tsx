/**
 * "Add from your past problems": every problem the tutor has written in other
 * sessions, with its answer key, filterable by course week and searchable.
 * One click copies it (prompt, key and expected mistakes) into this session.
 * All client-side: RBAC already gives a tutor their own problems, keys and
 * sessions, and nobody else's. Follow-up checks aren't listed. Identical
 * problems (same prompt and key) from several sessions show once, newest first.
 */

import { useMemo, useState } from 'react'
import { useAuth, useMutations, useQuery } from 'deepspace'
import { Library } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import type { AnswerKeyData, ProblemData, SessionData } from '../../actions/types'
import { TOPICS } from '../../lib/topics'
import { MathText } from '../MathText'
import { KeyMath } from './ProblemEditor'

const SHOW = 30
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export function ProblemBank({ sessionId, sessionTopic, nextOrder, current }: { sessionId: string; sessionTopic?: string; nextOrder: number; current: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Your past problems" data-testid="problem-bank">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="problem-bank-toggle"
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Library aria-hidden className="size-4 text-primary" /> Add from your past problems
        </span>
        <span className="text-sm text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <BankList sessionId={sessionId} sessionTopic={sessionTopic} nextOrder={nextOrder} current={current} />}
    </section>
  )
}

function BankList({ sessionId, sessionTopic, nextOrder, current }: { sessionId: string; sessionTopic?: string; nextOrder: number; current: string[] }) {
  const { userId } = useAuth()
  const { records: problems, status } = useQuery<ProblemData>('problems')
  const { records: keys } = useQuery<AnswerKeyData>('answerKeys')
  const { records: sessions } = useQuery<SessionData>('sessions')
  const problemMut = useMutations<Partial<ProblemData>>('problems')
  const keyMut = useMutations<Partial<AnswerKeyData>>('answerKeys')
  const [topic, setTopic] = useState(sessionTopic ?? '')
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [order, setOrder] = useState(nextOrder)

  const bank = useMemo(() => {
    const keyByProblem = new Map(keys.filter((k) => k.createdBy === userId).map((k) => [k.data.problemId, k.data]))
    const sessionById = new Map(sessions.filter((s) => s.createdBy === userId).map((s) => [s.recordId, s]))
    const seen = new Set<string>()
    return problems
      .filter((p) => p.createdBy === userId && p.data.sessionId !== sessionId && p.data.followUp !== 1 && sessionById.has(p.data.sessionId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({ p, key: keyByProblem.get(p.recordId), session: sessionById.get(p.data.sessionId)! }))
      .filter((r) => {
        const id = `${norm(r.p.data.prompt)}|${norm(r.key?.answer ?? '')}`
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
  }, [problems, keys, sessions, userId, sessionId])

  const weeks = TOPICS.filter((t) => bank.some((r) => r.session.data.topic === t.id))
  const needle = q.trim().toLowerCase()
  const shown = bank
    .filter((r) => !topic || r.session.data.topic === topic)
    .filter((r) => !needle || r.p.data.prompt.toLowerCase().includes(needle) || r.session.data.title.toLowerCase().includes(needle))
  const inSession = new Set(current.map(norm))

  async function add(r: (typeof bank)[number]) {
    setBusy(r.p.recordId)
    try {
      // After anything added meanwhile with the form above, too.
      const at = Math.max(order, nextOrder)
      const problemId = await problemMut.createConfirmed({ sessionId, order: at, prompt: r.p.data.prompt })
      if (r.key) await keyMut.createConfirmed({ problemId, answer: r.key.answer, expectedMistakes: r.key.expectedMistakes ?? '' })
      setOrder(at + 1)
      setAdded((s) => new Set(s).add(r.p.recordId))
    } finally {
      setBusy(null)
    }
  }

  if (status === 'loading') return <p className="mt-3 text-sm text-muted-foreground">Loading your problems…</p>
  if (bank.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Problems from your other sessions will show up here, ready to reuse.</p>
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="h-9 max-w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground"
          aria-label="Course week"
          data-testid="problem-bank-week"
        >
          <option value="">All weeks</option>
          {weeks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts or session titles" className="h-9 min-w-0 flex-1" aria-label="Search your problems" data-testid="problem-bank-search" />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No problems match.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shown.slice(0, SHOW).map((r) => {
            const already = added.has(r.p.recordId) || inSession.has(norm(r.p.data.prompt))
            return (
              <li key={r.p.recordId} className="flex items-start justify-between gap-3 px-3 py-2" data-testid="problem-bank-row">
                <div className="min-w-0 flex-1">
                  <div className="overflow-x-auto text-foreground"><MathText source={r.p.data.prompt} /></div>
                  <p className="text-xs text-muted-foreground">
                    Answer: {r.key ? <KeyMath answer={r.key.answer} /> : 'none'} · from “{r.session.data.title}”
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={already || busy !== null || !problemMut.ready || !keyMut.ready} onClick={() => add(r)} data-testid="problem-bank-add">
                  {already ? 'Added' : busy === r.p.recordId ? 'Adding…' : 'Add'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {shown.length > SHOW && <p className="text-xs text-muted-foreground">Showing {SHOW} of {shown.length}. Search or pick a week to narrow it down.</p>}
    </div>
  )
}
