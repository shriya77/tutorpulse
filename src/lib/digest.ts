/**
 * The tutor's weekly digest email (pure, unit-tested). Built from the same
 * aggregates as the History page (`buildHistory`): the past 7 days for the
 * headline, sessions and this week's misconceptions, and the past 4 weeks
 * to spot students whose mistake came back in more than one session.
 *
 * It goes only to the tutor who ran the sessions and who opted in, so it may
 * name their students (as History does). It never includes students' email
 * addresses, answers or anyone else's sessions.
 */

import { escapeHtml, oneLine } from './recapEmail'
import type { SessionSummary, StudentTrend } from './history'

export interface DigestInput {
  tutorName: string
  /** The 7 days covered, for the heading. */
  from: Date
  to: Date
  /** `buildHistory` over the past 7 days (sessions newest first). */
  week: { sessions: SessionSummary[]; students: StudentTrend[] }
  /** `buildHistory` over the past 4 weeks, for mistakes that came back. */
  month: { students: StudentTrend[] }
  /** Absolute link to /history. */
  historyUrl: string
  /** Absolute link to /settings (to turn it off). */
  settingsUrl: string
}

export interface DigestEmail {
  subject: string
  text: string
  html: string
}

const MAX_SESSIONS = 8
const MAX_MISTAKES = 5
const MAX_STUDENTS = 6

/** The digest's clock: it's sent at 08:00 here (src/cron.ts) and its dates are written in it. */
export const DIGEST_TIME_ZONE = 'America/Chicago'

const pct = (r: number | null) => (r === null ? 'no answers' : `${Math.round(r * 100)}% right`)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: DIGEST_TIME_ZONE })
const range = (a: Date, b: Date) =>
  `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DIGEST_TIME_ZONE })} to ${b.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DIGEST_TIME_ZONE })}`

/** Nothing ran in the week: no email is sent (an empty digest is just noise). */
export function isEmptyDigest(input: Pick<DigestInput, 'week'>): boolean {
  return input.week.sessions.length === 0
}

export function buildDigest(input: DigestInput): DigestEmail {
  const { sessions, students } = input.week
  const answers = sessions.reduce((n, s) => n + s.answers, 0)
  const right = sessions.reduce((n, s) => n + (s.correctRate === null ? 0 : Math.round(s.correctRate * s.answers)), 0)
  const studentCount = new Set(students.map((s) => s.id)).size
  const first = oneLine(input.tutorName, 40).split(' ')[0] || 'there'

  // This week's misconceptions across sessions: label → distinct students grouped under it.
  const byLabel = new Map<string, number>()
  for (const st of students) for (const m of st.mistakes) byLabel.set(m.label, (byLabel.get(m.label) ?? 0) + 1)
  const mistakes = [...byLabel.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_MISTAKES)

  // Students whose mistake came back in 2+ sessions over the past 4 weeks.
  const checkIn = input.month.students
    .map((s) => ({ name: s.name, m: s.mistakes.find((m) => m.sessions > 1) }))
    .filter((s): s is { name: string; m: StudentTrend['mistakes'][number] } => !!s.m)
    .slice(0, MAX_STUDENTS)

  const headline = `${sessions.length} session${sessions.length === 1 ? '' : 's'}, ${studentCount} student${studentCount === 1 ? '' : 's'}, ${answers} answer${answers === 1 ? '' : 's'} (${answers ? Math.round((right / answers) * 100) : 0}% right).`
  const intro = `Hi ${first}, here is your TutorPulse week, ${range(input.from, input.to)}: ${headline}`
  const sessionLines = sessions.slice(0, MAX_SESSIONS).map((s) => {
    const top = s.topMistakes[0] ? `; top mistake: ${oneLine(s.topMistakes[0].label, 80)} (${s.topMistakes[0].students})` : ''
    return `${day(s.date)}: ${oneLine(s.title, 80)}, ${s.students} student${s.students === 1 ? '' : 's'}, ${pct(s.correctRate)}${top}`
  })
  const more = sessions.length > MAX_SESSIONS ? `…and ${sessions.length - MAX_SESSIONS} more.` : ''
  const mistakeLines = mistakes.map(([label, n]) => `${oneLine(label, 80)}: ${n} student${n === 1 ? '' : 's'}`)
  const checkInLines = checkIn.map((s) => `${oneLine(s.name, 60)}: ${oneLine(s.m.label, 80)} (in ${s.m.sessions} sessions)`)
  const outro = 'You get this because you turned on the weekly summary in TutorPulse Settings. Turn it off there any time. It names your students, so it only ever goes to you.'

  const text = [
    intro,
    '',
    'Sessions',
    ...sessionLines.map((l) => `- ${l}`),
    more,
    ...(mistakeLines.length ? ['', 'Most common misconceptions', ...mistakeLines.map((l) => `- ${l}`)] : []),
    ...(checkInLines.length ? ['', 'Mistakes that came back (past 4 weeks)', ...checkInLines.map((l) => `- ${l}`)] : []),
    '',
    `See everything: ${input.historyUrl}`,
    '',
    outro,
    `Settings: ${input.settingsUrl}`,
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')

  const list = (items: string[]) => `<ul style="padding-left:20px;margin:6px 0">${items.map((l) => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join('')}</ul>`
  const h = (t: string) => `<h3 style="font-size:16px;margin:18px 0 4px">${escapeHtml(t)}</h3>`
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1d2b3a;max-width:560px;margin:0 auto;padding:16px;line-height:1.5">
<p>${escapeHtml(intro)}</p>
${h('Sessions')}${list(sessionLines)}${more ? `<p>${escapeHtml(more)}</p>` : ''}
${mistakeLines.length ? h('Most common misconceptions') + list(mistakeLines) : ''}
${checkInLines.length ? h('Mistakes that came back (past 4 weeks)') + list(checkInLines) : ''}
<p><a href="${escapeHtml(input.historyUrl)}" style="color:#1d4ed8">See your students over time in TutorPulse</a></p>
<p style="color:#64748b;font-size:13px">${escapeHtml(outro)} <a href="${escapeHtml(input.settingsUrl)}" style="color:#64748b">Settings</a></p>
</body></html>`

  return { subject: oneLine(`Your TutorPulse week: ${headline.replace(/\.$/, '')}`, 120), text, html }
}
