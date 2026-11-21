/**
 * Student end screen (F16): a download link once the tutor publishes the
 * practice set. Students can only read a `practiceSets` row after
 * `publishPracticeSet` adds them to it, so an unpublished set never reaches
 * this component. The PDF itself is served by a participant-checked route.
 */

import { useQuery } from 'deepspace'
import { getAuthToken } from 'deepspace'
import { useState } from 'react'
import { Button } from '@/components/ui'

type PracticeSetRow = { sessionId: string; status: string }

export function PracticeSetLink({ sessionId }: { sessionId: string }) {
  const { records } = useQuery<PracticeSetRow>('practiceSets', { where: { sessionId } })
  const published = records.filter((r) => r.data.status === 'published').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!published) return null
  return <DownloadPracticeSet practiceSetId={published.recordId} label="Download your practice set (PDF)" />
}

/** Fetch the PDF with the user's token, then hand it to the browser as a download. */
export function DownloadPracticeSet({ practiceSetId, label }: { practiceSetId: string; label: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    setError(null)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/practice-sets/${encodeURIComponent(practiceSetId)}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(res.status === 404 ? 'Not available yet' : `Download failed (${res.status})`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = 'tutorpulse-practice-set.pdf'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 space-y-1">
      <Button onClick={download} disabled={busy} data-testid="download-practice-set">
        {busy ? 'Preparing…' : label}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
