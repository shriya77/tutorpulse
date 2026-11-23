import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '../lib/callAction'

/** The signed-in user's TutorPulse display name ('' when they use their account name). RBAC returns only their own row. */
export function useMyDisplayName(): string {
  const { records } = useQuery<{ userId: string; name: string }>('displayNames')
  return records[0]?.data.name ?? ''
}

/** Tutor only: custom display names of a session's students, refreshed when the roster changes. */
export function useSessionDisplayNames(sessionId: string, participantIds: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const key = useMemo(() => [...participantIds].sort().join(','), [participantIds])
  useEffect(() => {
    let live = true
    const load = () =>
      callAction<{ names: Record<string, string> }>('sessionDisplayNames', { sessionId }).then((r) => {
        if (live && r.ok) setNames(r.data.names)
      })
    void load()
    // Names change rarely; pick up a rename within a minute.
    const t = setInterval(load, 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [sessionId, key])
  return names
}
