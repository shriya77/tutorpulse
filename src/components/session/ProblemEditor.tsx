/**
 * Tutor-only: add, edit, reorder and delete a session's problems (F3).
 * Prompts go to `problems` (readable by students); the correct answer and the
 * expected-mistake note go to `answerKeys` (readable only by the tutor).
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useMutations } from 'deepspace'
import { Button, Input, Label, Textarea } from '@/components/ui'
import type { AnswerKeyData, Envelope, ProblemData } from '../../actions/types'
import { MathText } from '../MathText'

type KeyMap = Map<string, Envelope<AnswerKeyData>>

/**
 * Loads the answer checker lazily (mathjs is large) to show how a key reads as
 * maths, or warn that it can't be graded.
 */
function useKeyInfo(answer: string): { tex: string | null; warning: string | null } {
  const [info, setInfo] = useState<{ tex: string | null; warning: string | null }>({ tex: null, warning: null })
  useEffect(() => {
    let live = true
    const text = answer.trim()
    if (!text) {
      setInfo({ tex: null, warning: null })
      return
    }
    void import('../../lib/answerCheck').then(({ keyKind, keyTex }) => {
      if (!live) return
      const ok = !!keyKind(text)
      setInfo({ tex: ok ? keyTex(text) : null, warning: ok ? null : 'This can’t be checked automatically, so every answer will be marked "needs review".' })
    })
    return () => {
      live = false
    }
  }, [answer])
  return info
}

/** The saved key as maths (the text as typed is in the tooltip), or as typed if it can't be read. */
export function KeyMath({ answer }: { answer: string }) {
  const { tex } = useKeyInfo(answer)
  if (!tex) return <code className="font-mono text-foreground">{answer}</code>
  return (
    <span className="text-foreground" title={`Typed as ${answer}`} data-testid="answer-key-math">
      <MathText source={tex} />
    </span>
  )
}

export function ProblemEditor({ sessionId, problems, keys }: { sessionId: string; problems: Envelope<ProblemData>[]; keys: KeyMap }) {
  return (
    <div className="space-y-4">
      {problems.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No problems yet. Add the first one below.
        </p>
      )}
      <ol className="space-y-4">
        {problems.map((p, i) => (
          <li key={p.recordId}>
            <ProblemRow
              index={i}
              problem={p}
              answerKey={keys.get(p.recordId)}
              prev={problems[i - 1]}
              next={problems[i + 1]}
            />
          </li>
        ))}
      </ol>
      <AddProblem sessionId={sessionId} nextOrder={(problems.at(-1)?.data.order ?? 0) + 1} />
    </div>
  )
}

function ProblemFields({
  idPrefix, prompt, setPrompt, answer, setAnswer, mistakes, setMistakes,
}: {
  idPrefix: string
  prompt: string; setPrompt: (v: string) => void
  answer: string; setAnswer: (v: string) => void
  mistakes: string; setMistakes: (v: string) => void
}) {
  const { tex, warning } = useKeyInfo(answer)
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-prompt`}>Prompt (LaTeX; wrap math in $…$ inside a sentence)</Label>
        <Textarea id={`${idPrefix}-prompt`} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="\frac{d}{dx}\sin(3x^2)" />
        {prompt.trim() && (
          <div className="rounded-md bg-muted px-3 py-2 text-foreground" aria-label="Preview">
            <MathText source={prompt} display />
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-answer`}>Correct answer (only you can see this)</Label>
        <p className="-mt-1 text-xs text-muted-foreground">
          An expression in x, t or θ (<code>6x*cos(3x^2)</code>), numbers (<code>x = -1, 3</code>), intervals (<code>(-inf, 2) U (3, inf)</code>) or a limit (<code>DNE</code>, <code>inf</code>).
        </p>
        <Input id={`${idPrefix}-answer`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="6x*cos(3x^2)" className="font-mono" />
        {tex && (
          <p className="text-sm text-muted-foreground" data-testid="answer-preview">
            Reads as: <span className="text-foreground"><MathText source={tex} /></span>
          </p>
        )}
        {warning && <p className="rounded-md border border-warning/50 bg-warning/15 px-2 py-1 text-xs text-foreground">{warning}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-mistakes`}>Mistakes you expect (optional, helps the AI name groups)</Label>
        <Input id={`${idPrefix}-mistakes`} value={mistakes} onChange={(e) => setMistakes(e.target.value)} placeholder="Forgetting the inner derivative 6x" />
      </div>
    </div>
  )
}

function ProblemRow({
  index, problem, answerKey, prev, next,
}: {
  index: number
  problem: Envelope<ProblemData>
  answerKey?: Envelope<AnswerKeyData>
  prev?: Envelope<ProblemData>
  next?: Envelope<ProblemData>
}) {
  const problems = useMutations<Partial<ProblemData>>('problems')
  const answerKeys = useMutations<Partial<AnswerKeyData>>('answerKeys')
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt] = useState(problem.data.prompt)
  const [answer, setAnswer] = useState(answerKey?.data.answer ?? '')
  const [mistakes, setMistakes] = useState(answerKey?.data.expectedMistakes ?? '')
  const ready = problems.ready && answerKeys.ready

  function startEdit() {
    setPrompt(problem.data.prompt)
    setAnswer(answerKey?.data.answer ?? '')
    setMistakes(answerKey?.data.expectedMistakes ?? '')
    setEditing(true)
  }

  async function save() {
    if (!prompt.trim() || !answer.trim()) return
    await problems.putConfirmed(problem.recordId, { prompt: prompt.trim() })
    const keyData = { answer: answer.trim(), expectedMistakes: mistakes.trim() }
    if (answerKey) await answerKeys.putConfirmed(answerKey.recordId, keyData)
    else await answerKeys.createConfirmed({ problemId: problem.recordId, ...keyData })
    setEditing(false)
  }

  async function swap(other: Envelope<ProblemData> | undefined) {
    if (!other) return
    await Promise.all([
      problems.put(problem.recordId, { order: other.data.order }),
      problems.put(other.recordId, { order: problem.data.order }),
    ])
  }

  async function remove() {
    if (!window.confirm(`Delete problem ${index + 1}? Its answers and groups stay in the history but it disappears from the session.`)) return
    if (answerKey) await answerKeys.removeConfirmed(answerKey.recordId)
    await problems.removeConfirmed(problem.recordId)
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] p-4" data-testid="problem-row">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">Problem {index + 1}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => swap(prev)} disabled={!prev || !ready} aria-label={`Move problem ${index + 1} up`}>↑</Button>
          <Button size="sm" variant="ghost" onClick={() => swap(next)} disabled={!next || !ready} aria-label={`Move problem ${index + 1} down`}>↓</Button>
          {!editing && <Button size="sm" variant="outline" onClick={startEdit} disabled={!ready}>Edit</Button>}
          <Button size="sm" variant="ghost" onClick={remove} disabled={!ready} aria-label={`Delete problem ${index + 1}`}>Delete</Button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-3">
          <ProblemFields idPrefix={problem.recordId} {...{ prompt, setPrompt, answer, setAnswer, mistakes, setMistakes }} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!ready || !prompt.trim() || !answer.trim()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-lg text-foreground"><MathText source={problem.data.prompt} display /></div>
          <p className="text-sm text-muted-foreground">
            Answer: {answerKey ? <KeyMath answer={answerKey.data.answer} /> : <span className="text-foreground">missing, add one</span>}
          </p>
        </div>
      )}
    </div>
  )
}

function AddProblem({ sessionId, nextOrder }: { sessionId: string; nextOrder: number }) {
  const problems = useMutations<Partial<ProblemData>>('problems')
  const answerKeys = useMutations<Partial<AnswerKeyData>>('answerKeys')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [mistakes, setMistakes] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = problems.ready && answerKeys.ready

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || !answer.trim()) return
    setBusy(true)
    try {
      const problemId = await problems.createConfirmed({ sessionId, order: nextOrder, prompt: prompt.trim() })
      await answerKeys.createConfirmed({ problemId, answer: answer.trim(), expectedMistakes: mistakes.trim() })
      setPrompt('')
      setAnswer('')
      setMistakes('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-dashed border-border p-4" aria-label="Add a problem">
      <h3 className="text-sm font-medium text-foreground">Add a problem</h3>
      {/* Locked while saving: the form clears when the save lands, which would wipe anything typed meanwhile. */}
      <fieldset disabled={busy} className="contents">
        <ProblemFields idPrefix="new" {...{ prompt, setPrompt, answer, setAnswer, mistakes, setMistakes }} />
      </fieldset>
      <Button type="submit" size="sm" disabled={!ready || busy || !prompt.trim() || !answer.trim()} data-testid="add-problem">
        {busy ? 'Adding…' : 'Add problem'}
      </Button>
    </form>
  )
}
