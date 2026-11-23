/**
 * A thin bar under the nav when the app can't reach the server: the browser
 * is offline, or the live connection dropped and is reconnecting. It waits a
 * couple of seconds before showing, so a normal start-up or a blip doesn't
 * flash it, and it says "Back online" briefly once the link returns.
 * Live updates pause while it's showing; record writes queue and go out on
 * reconnect, but submitting an answer needs the connection.
 */

import { useEffect, useState } from 'react'
import { useRecordContext } from 'deepspace'
import { WifiOff } from 'lucide-react'

const SHOW_AFTER_MS = 2500

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function ConnectionBanner() {
  const { status } = useRecordContext()
  const online = useOnline()
  const down = !online || status !== 'connected'
  const [show, setShow] = useState(false)
  const [back, setBack] = useState(false)

  useEffect(() => {
    if (!down) {
      if (show) {
        setShow(false)
        setBack(true)
        const t = setTimeout(() => setBack(false), 2500)
        return () => clearTimeout(t)
      }
      return
    }
    const t = setTimeout(() => setShow(true), online ? SHOW_AFTER_MS : 0)
    return () => clearTimeout(t)
  }, [down, online])

  if (back) {
    return (
      <div role="status" className="bg-success/12 px-4 py-1.5 text-center text-sm font-medium text-success" data-testid="connection-back">
        Back online
      </div>
    )
  }
  if (!show) return null
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 bg-highlight/60 px-4 py-1.5 text-center text-sm text-foreground" data-testid="connection-banner">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      {online
        ? 'Reconnecting… Live updates are paused; this page catches up by itself.'
        : 'You’re offline. Live updates are paused until you’re back; submitting needs a connection.'}
    </div>
  )
}
