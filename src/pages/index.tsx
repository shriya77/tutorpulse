/**
 * Landing page — a STATIC page (no auth fetch, no WebSocket), prerendered at
 * build so it loads instantly and reads well to crawlers. The app itself
 * lives behind /home.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const STEPS = [
  { title: 'Students submit', body: 'Join with a 6-letter code or QR from a phone, write the working on a sketch pad or snap a photo of paper, and type the final answer.' },
  { title: 'See why, not just who', body: 'Answers are checked exactly; the wrong ones are grouped into named misconceptions on your board, live.' },
  { title: 'Teach the biggest group', body: 'Put a misconception on everyone’s screen, explain it once, and watch the count fall as students revise.' },
  { title: 'Leave with practice', body: 'End the session and get a PDF of new problems that target the mistakes your group actually made.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <main data-testid="static-landing" className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
        <header className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">TutorPulse</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            See <span className="hl">why</span> your group gets it wrong.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            A live room for group tutoring. Seven students write cos(3x²) for d/dx sin(3x²)? Your board says
            “Dropped the inner derivative: 7” within seconds, so one explanation fixes most of the room.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/home"
              className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open TutorPulse
            </Link>
            <span className="self-center text-sm text-muted-foreground">Have a code? Open TutorPulse and enter it.</span>
          </div>
        </header>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_0_rgba(29,43,58,0.05)]">
              <p className="text-sm text-muted-foreground">Step {i + 1}</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-foreground">{s.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Built on DeepSpace. Correctness is checked by maths, not AI; AI only names the mistakes.
        </p>
      </main>
    </>
  )
}
