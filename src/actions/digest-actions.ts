/**
 * Weekly digest settings (the email itself: src/server/digest.ts).
 * - `setWeeklyDigest`: the caller turns their own weekly summary on or off.
 * - `sendDigestPreview`: email the caller their digest for the past 7 days
 *   now, to their own address only. At most once every 10 minutes; test
 *   accounts are never emailed. Returns what happened, never the address.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { actionReader, sendTutorDigest } from '../server/digest'
import type { Envelope } from './types'

const PREVIEW_EVERY_MS = 10 * 60 * 1000

type Pref = { userId: string; weekly: number; lastPreviewAt?: string }

async function myPref(tools: ActionTools, userId: string): Promise<Envelope<Pref> | undefined> {
  const r = await tools.query<Pref>('digestPrefs', { where: { userId }, limit: 1 })
  return r.success ? (r.data.records[0] as Envelope<Pref> | undefined) : undefined
}

async function savePref(tools: ActionTools, userId: string, data: Partial<Pref>) {
  const row = await myPref(tools, userId)
  return row ? tools.update('digestPrefs', row.recordId, data) : tools.create('digestPrefs', { userId, ...data })
}

export const setWeeklyDigest: ActionHandler<Env> = async (ctx) => {
  if (typeof ctx.params.weekly !== 'boolean') return { success: false, error: 'weekly must be true or false' }
  const res = await savePref(ctx.tools, ctx.userId, { weekly: ctx.params.weekly ? 1 : 0 })
  if (!res.success) return { success: false, error: 'Could not save that' }
  return { success: true, data: { weekly: ctx.params.weekly } }
}

export const sendDigestPreview: ActionHandler<Env> = async (ctx) => {
  const pref = await myPref(ctx.tools, ctx.userId)
  const last = pref?.data.lastPreviewAt ? Date.parse(pref.data.lastPreviewAt) : 0
  if (Date.now() - last < PREVIEW_EVERY_MS) return { success: false, error: 'You can send a preview once every 10 minutes' }
  await savePref(ctx.tools, ctx.userId, { lastPreviewAt: new Date().toISOString() })
  const outcome = await sendTutorDigest(actionReader(ctx.tools), ctx.userId, new Date(), ctx.env.APP_NAME, async (mail) => {
    const r = await ctx.tools.integration('email/send', { to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
    if (!r.success) console.warn('[digest] preview send failed', r.error?.slice(0, 120))
    return r.success
  })
  return { success: true, data: { outcome } }
}
