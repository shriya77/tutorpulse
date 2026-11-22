/**
 * Loads a submission's handwritten working through the checked route
 * (GET /api/submissions/:id/work) and returns a blob URL for <img>/<canvas>.
 * The route answers only the student who wrote it and the session's tutor.
 * `revision` re-fetches when the student saves new working.
 */

import { useEffect, useState } from 'react'
import { getAuthToken } from 'deepspace'

export function useWorkImage(submissionId: string | undefined, hasWork: boolean, revision = 0) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!submissionId || !hasWork) {
      setUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    ;(async () => {
      try {
        const token = await getAuthToken()
        const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/work`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [submissionId, hasWork, revision])

  return { url, failed }
}
