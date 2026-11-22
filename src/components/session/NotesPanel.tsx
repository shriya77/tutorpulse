/**
 * Tutor notes upload (F14). The file goes to the tutor's PRIVATE file folder
 * via `useR2Files`; `addSessionNotes` then indexes it in the managed
 * knowledge base for this session, where the hint assistant can search it.
 * Indexing takes a while, so we refresh status from the knowledge base until
 * every file reports `completed` (or fails).
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useR2Files } from 'deepspace'
import { Badge, Label } from '@/components/ui'
import { callAction } from '../../lib/callAction'
import { MAX_NOTES_BYTES } from '../../lib/limits'

type NoteRow = { sessionId: string; fileName: string; status: string; error?: string; sizeBytes: number }

const TYPE_BY_EXT: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' }

const STATUS_TEXT: Record<string, string> = {
  queued: 'Indexing…',
  running: 'Indexing…',
  completed: 'Ready for hints',
  error: 'Could not index',
  skipped: 'Skipped',
  outdated: 'Re-indexing…',
}

export function NotesPanel({ sessionId }: { sessionId: string }) {
  const { upload } = useR2Files()
  const { records } = useQuery<NoteRow>('sessionNotes', { where: { sessionId } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = records.some((r) => ['queued', 'running', 'outdated'].includes(r.data.status))

  // Poll indexing status only while something is still indexing.
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => void callAction('refreshSessionNotes', { sessionId }), 5000)
    return () => clearInterval(t)
  }, [pending, sessionId])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    const mimeType = TYPE_BY_EXT[file.name.split('.').pop()?.toLowerCase() ?? '']
    if (!mimeType) return setError('Upload a PDF, .txt or .md file.')
    if (file.size > MAX_NOTES_BYTES) return setError('Notes files must be 4 MB or smaller.')
    setBusy(true)
    try {
      const up = await upload(file, file.name)
      if (!up.success || !up.key) throw new Error(up.error ?? 'Upload failed')
      const r = await callAction('addSessionNotes', { sessionId, fileKey: up.key, fileName: file.name, mimeType })
      if (!r.ok) throw new Error(r.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Notes for the hint assistant" className="space-y-3 rounded-2xl border border-border bg-card shadow-[0_1px_2px_0_rgba(29,43,58,0.05)] p-4" data-testid="notes-panel">
      <div>
        <h2 className="font-medium text-foreground">Notes for the hint assistant</h2>
        <p className="text-sm text-muted-foreground">
          Upload a worksheet or notes (PDF, .txt or .md, up to 4 MB). Hints will draw on them. Leave worked solutions out: the assistant
          is told never to give answers, but it can quote your notes.
        </p>
      </div>
      {records.length > 0 && (
        <ul className="space-y-1">
          {records.map((r) => (
            <li key={r.recordId} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.data.fileName}</span>
              <Badge variant={r.data.status === 'completed' ? 'success' : r.data.status === 'error' ? 'destructive' : 'outline'} data-testid="note-status">
                {STATUS_TEXT[r.data.status] ?? r.data.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Label htmlFor={`notes-${sessionId}`} className="sr-only">Upload notes</Label>
        <input
          ref={inputRef}
          id={`notes-${sessionId}`}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          onChange={onFile}
          disabled={busy}
          className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-foreground"
          data-testid="notes-input"
        />
        {busy && <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">Uploading…</p>}
        {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    </section>
  )
}
