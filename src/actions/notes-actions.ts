/**
 * Tutor notes for the hint assistant (F14).
 *
 * The tutor uploads a file with `useR2Files()` into their PRIVATE folder,
 * then calls `addSessionNotes`. The action re-reads the file from that folder
 * (so it can only index the caller's own files), adds it to the app's managed
 * knowledge base under folder `<sessionId>`, and records a sidecar row.
 * `refreshSessionNotes` copies indexing status from `kb.list` onto the rows
 * so the UI can show "Indexing…" until `completed`.
 */

import { appFiles, knowledge, KnowledgeError } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { MAX_NOTES_BYTES, NOTES_MIME_TYPES } from '../lib/limits'
import { requireTutor } from './guards'
import type { Envelope } from './types'

type NoteRow = { sessionId: string; knowledgeItemIds: string[]; status: string; fileKey: string }

function safeFileName(name: unknown): string {
  const base = typeof name === 'string' ? name : 'notes'
  // Folder + name must fit the 128-char key limit; keep it plain.
  return base.replace(/[^\w.\- ]+/g, '_').slice(-80) || 'notes'
}

export const addSessionNotes: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId, { statuses: ['draft', 'open'] })
  if (!g.ok) return { success: false, error: g.error }
  const { fileKey, mimeType } = ctx.params
  if (typeof fileKey !== 'string' || !fileKey) return { success: false, error: 'Upload a file first' }
  if (typeof mimeType !== 'string' || !NOTES_MIME_TYPES.includes(mimeType)) {
    return { success: false, error: 'Notes must be a PDF, .txt or .md file' }
  }
  const fileName = safeFileName(ctx.params.fileName)

  let blob: Blob
  try {
    // scope 'self' + the caller's id: a key from anyone else's folder is refused.
    const res = await appFiles(ctx.env, { scope: 'self', userId: ctx.userId }).download(fileKey)
    blob = await res.blob()
  } catch {
    return { success: false, error: 'Could not read the uploaded file' }
  }
  if (blob.size > MAX_NOTES_BYTES) return { success: false, error: 'Notes files must be 4 MB or smaller' }

  let itemIds: string[]
  try {
    const added = await knowledge(ctx.env)
      .scoped({ folder: g.session.recordId })
      .add(new File([blob], fileName, { type: mimeType }))
    itemIds = added.items.map((i) => i.id)
  } catch (e) {
    const detail = e instanceof KnowledgeError ? ` (${e.code})` : ''
    return { success: false, error: `Could not index the notes${detail}` }
  }

  const row = await ctx.tools.create('sessionNotes', {
    sessionId: g.session.recordId,
    fileKey,
    fileName,
    mimeType,
    sizeBytes: blob.size,
    knowledgeItemIds: itemIds,
    status: 'queued',
  })
  if (!row.success) return { success: false, error: 'Indexed, but could not record the file' }
  return { success: true, data: { noteId: row.data.recordId } }
}

/** Pull indexing status from the knowledge base onto this session's note rows. */
export const refreshSessionNotes: ActionHandler<Env> = async (ctx) => {
  const g = await requireTutor(ctx, ctx.params.sessionId)
  if (!g.ok) return { success: false, error: g.error }
  const notes = await ctx.tools.query('sessionNotes', { where: { sessionId: g.session.recordId } })
  if (!notes.success) return { success: false, error: 'Could not load notes' }
  const listed = await knowledge(ctx.env).scoped({ folder: g.session.recordId }).list({ perPage: 50 })
  const status = new Map(listed.items.map((i) => [i.id, i]))

  const rank = ['error', 'skipped', 'outdated', 'queued', 'running', 'completed']
  for (const n of notes.data.records as Envelope<NoteRow>[]) {
    const items = (n.data.knowledgeItemIds ?? []).map((id) => status.get(id)).filter(Boolean)
    if (items.length === 0) continue
    // A split file is only as ready as its least-ready part.
    const worst = items.reduce((a, b) => (rank.indexOf(a!.status) <= rank.indexOf(b!.status) ? a : b))!
    if (worst.status !== n.data.status) {
      await ctx.tools.update('sessionNotes', n.recordId, { status: worst.status, error: worst.error ?? '' })
    }
  }
  return { success: true, data: { count: notes.data.count } }
}
