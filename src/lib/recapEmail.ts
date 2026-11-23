/**
 * The recap email a student opted into (sent by `sendRecaps` after the session
 * ends). It holds ONLY that student's own results: whether each answer was
 * right, their own answer, and the name of the mistake group they were in.
 * Never the answer key, other students, or the AI's explanation (written for
 * the tutor, and it may quote other students' answers).
 */

export type RecapStatus = 'correct' | 'incorrect' | 'needs_review' | 'not_answered'

export interface RecapProblem {
  number: number
  status: RecapStatus
  /** The student's own final answer (plain text as typed). */
  answer?: string
  /** Label of the misconception group their answer was in, if any. */
  mistake?: string
}

export interface RecapInput {
  studentName: string
  sessionTitle: string
  /** Absolute link to the session page in the app. */
  sessionUrl: string
  problems: RecapProblem[]
  practiceSetShared: boolean
}

export interface RecapEmail {
  subject: string
  text: string
  html: string
}

/** Single-line, length-capped text (also keeps newlines out of the subject header). */
export function oneLine(s: string, max = 120): string {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function firstName(name: string): string {
  return oneLine(name, 40).split(' ')[0] || 'there'
}

function line(p: RecapProblem): string {
  const answer = p.answer ? `Your answer: ${oneLine(p.answer, 80)}.` : ''
  switch (p.status) {
    case 'correct':
      return `Problem ${p.number}: right.`
    case 'not_answered':
      return `Problem ${p.number}: not answered.`
    case 'needs_review':
      return `Problem ${p.number}: your tutor will check this one by hand. ${answer}`.trim()
    case 'incorrect':
      return [`Problem ${p.number}: not quite.`, answer, p.mistake ? `The mistake to watch: ${oneLine(p.mistake, 80)}.` : '']
        .filter(Boolean)
        .join(' ')
  }
}

export function buildRecapEmail(input: RecapInput): RecapEmail {
  const title = oneLine(input.sessionTitle, 80) || 'your session'
  const right = input.problems.filter((p) => p.status === 'correct').length
  const lines = input.problems.map(line)
  const practice = input.practiceSetShared
    ? 'Your tutor shared a practice set aimed at the mistakes the group made. You can download it from the session page.'
    : ''
  const intro = `Hi ${firstName(input.studentName)}, here is your recap of "${title}". You got ${right} of ${input.problems.length} right.`
  const outro = 'You get this because you ticked "Email me a recap" in this session. Each session asks again, so you won\'t get others unless you tick it there too.'

  const text = [intro, '', ...lines, '', practice, `Open the session: ${input.sessionUrl}`, '', outro].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')

  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1d2b3a;max-width:560px;margin:0 auto;padding:16px;line-height:1.5">
<p>${escapeHtml(intro)}</p>
<ul style="padding-left:20px">${lines.map((l) => `<li style="margin:6px 0">${escapeHtml(l)}</li>`).join('')}</ul>
${practice ? `<p>${escapeHtml(practice)}</p>` : ''}
<p><a href="${escapeHtml(input.sessionUrl)}" style="color:#1d4ed8">Open the session in TutorPulse</a></p>
<p style="color:#64748b;font-size:13px">${escapeHtml(outro)}</p>
</body></html>`

  return { subject: oneLine(`Your recap: ${title}`, 120), text, html }
}
