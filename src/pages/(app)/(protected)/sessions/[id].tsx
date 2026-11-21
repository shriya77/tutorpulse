/**
 * /sessions/:id — one page, two roles. The session's creator gets the tutor
 * setup/board; a joined student gets the answer screen. Anyone else receives
 * no session row from the data layer and sees "not found".
 */

import { Link, useParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import { Badge } from '@/components/ui'
import { StudentView } from '../../../../components/session/StudentView'
import { TutorView } from '../../../../components/session/TutorView'
import { useSessionRecord } from '../../../../hooks/useSessionData'

export default function SessionPage() {
  const { id } = useParams()
  const { userId } = useAuth()
  const { session, status } = useSessionRecord(id)

  if (status === 'loading') return <p className="p-6 text-muted-foreground">Loading session…</p>
  if (!session) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-medium text-foreground">Session not found</p>
        <p className="mt-1 text-sm text-muted-foreground">Join with the code your tutor shows, or check the link.</p>
        <Link to="/home" className="mt-4 inline-block text-sm underline">Back to home</Link>
      </div>
    )
  }

  const isTutor = session.createdBy === userId
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="session-title">{session.data.title}</h1>
        <Badge variant={session.data.status === 'open' ? 'success' : 'outline'}>
          {session.data.status === 'open' ? 'Live' : session.data.status === 'draft' ? 'Draft' : 'Ended'}
        </Badge>
        {isTutor && <Badge variant="secondary">You’re the tutor</Badge>}
      </header>
      {isTutor ? <TutorView session={session} /> : <StudentView session={session} />}
    </div>
  )
}
