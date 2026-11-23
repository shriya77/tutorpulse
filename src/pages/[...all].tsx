import { Link } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { APP_NAME } from '../constants'

/**
 * 404. Lives outside the app layout (it must also catch broken static URLs),
 * so it carries its own logo and ways back.
 */
export default function NotFound() {
  return (
    <div className="paper-grid flex min-h-screen flex-col px-4" data-testid="not-found">
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <header className="mx-auto flex h-14 w-full max-w-5xl items-center">
        <Link to="/home" className="flex items-center gap-2 text-foreground" aria-label={`${APP_NAME} home`}>
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-4" strokeWidth={2.5} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">TutorPulse</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">This page doesn’t exist</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The link may be mistyped or the page may have moved. If you were joining a session, enter the code from your tutor’s screen on the home page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/home"
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to TutorPulse
          </Link>
          <Link to="/" className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            What is TutorPulse?
          </Link>
        </div>
      </main>
    </div>
  )
}
