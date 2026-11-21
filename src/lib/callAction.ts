/**
 * Call a server action (POST /api/actions/<name>) with the signed-in user's
 * token. Returns a discriminated result instead of throwing, so pages can
 * show the action's own error message.
 */

import { getAuthToken } from 'deepspace'

export type ActionCall<T> = { ok: true; data: T } | { ok: false; error: string }

export async function callAction<T = Record<string, unknown>>(
  name: string,
  params: Record<string, unknown>,
): Promise<ActionCall<T>> {
  const token = await getAuthToken()
  if (!token) return { ok: false, error: 'Please sign in again' }
  try {
    const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null
    if (body?.success) return { ok: true, data: body.data as T }
    return { ok: false, error: body?.error ?? `Request failed (${res.status})` }
  } catch {
    return { ok: false, error: 'Network error, check your connection and try again' }
  }
}
