/**
 * /join?code=XXXXXX — where the projector QR code lands. Requires sign-in
 * (the (protected) layout shows the sign-in panel first), then joins once and
 * goes straight to the session. A bad or closed code shows the error with a
 * way to retype it.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { callAction } from '../../../lib/callAction'

export default function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code') ?? ''
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void callAction<{ sessionId: string }>('joinSession', { joinCode: code }).then((r) => {
      if (r.ok) navigate(`/sessions/${r.data.sessionId}`, { replace: true })
      else setError(r.error)
    })
  }, [code, navigate])

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      {error ? (
        <>
          <p role="alert" className="text-lg font-medium text-foreground">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">Check the code with your tutor and try again.</p>
          <Link to="/home" className="mt-4 inline-block text-sm underline">Enter a code</Link>
        </>
      ) : (
        <p className="text-muted-foreground" aria-live="polite">Joining session {code.toUpperCase()}…</p>
      )}
    </div>
  )
}
