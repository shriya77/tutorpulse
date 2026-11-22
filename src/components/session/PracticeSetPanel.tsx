/**
 * Tutor's wrap-up panel (F15, F16): live progress of the practice-set job,
 * a download to review it, "Share with students", and retry on failure.
 * Progress comes from the `practiceSets` row (only the tutor can read it
 * until it's shared).
 */

import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Badge, Button } from '@/components/ui'
import type { Envelope, PracticeSetData, SessionData } from '../../actions/types'
import { callAction } from '../../lib/callAction'
import { DownloadPracticeSet } from './PracticeSetLink'

export function PracticeSetPanel({ session }: { session: Envelope<SessionData> }) {
  const { records, status } = useQuery<PracticeSetData>('practiceSets', { where: { sessionId: session.recordId } })
  const latest = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(name: 'generatePracticeSet' | 'publishPracticeSet', params: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    const r = await callAction(name, params)
    setBusy(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <section aria-label="Practice set" className="space-y-3 rounded-xl border border-border bg-card p-5" data-testid="practice-panel">
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-foreground">Practice set</h2>
        {latest && (
          <Badge variant={latest.data.status === 'published' ? 'success' : latest.data.status === 'failed' ? 'destructive' : 'outline'} data-testid="practice-status">
            {latest.data.status === 'generating' ? 'Generating' : latest.data.status === 'ready' ? 'Ready to review' : latest.data.status === 'published' ? 'Shared with students' : 'Failed'}
          </Badge>
        )}
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !latest ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Generate a PDF with new problems that target this session’s most common mistakes.</p>
          <Button onClick={() => run('generatePracticeSet', { sessionId: session.recordId })} disabled={busy} data-testid="generate-practice-set">
            Generate practice set
          </Button>
        </div>
      ) : latest.data.status === 'generating' ? (
        <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="practice-progress">
          {latest.data.progressMessage || 'Working…'} This usually takes under a minute.
        </p>
      ) : latest.data.status === 'failed' ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{latest.data.progressMessage || 'Generation failed.'}</p>
          <Button variant="outline" onClick={() => run('generatePracticeSet', { sessionId: session.recordId })} disabled={busy}>Try again</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <DownloadPracticeSet practiceSetId={latest.recordId} label="Download to review" />
          {latest.data.status === 'ready' && (
            <Button className="mt-4" onClick={() => run('publishPracticeSet', { practiceSetId: latest.recordId })} disabled={busy} data-testid="publish-practice-set">
              Share with students
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
