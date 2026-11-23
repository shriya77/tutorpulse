/**
 * The most common wrong answers to one problem, alongside the AI's groups:
 * the same final answer typed by several students is often the quickest
 * thing to put on the board. Answers count as the same when they match after
 * ignoring spaces, case, `*` and the kind of minus sign. Only answers given
 * by at least two students are listed, so nobody's lone answer is singled out.
 */

export interface CommonAnswer {
  /** The most frequent spelling of this answer, as students typed it. */
  answer: string
  count: number
}

export const answerKey = (raw: string) => raw.normalize('NFKC').toLowerCase().replace(/[−–—]/g, '-').replace(/[\s*]/g, '')

export function commonWrongAnswers(answers: string[], limit = 3): CommonAnswer[] {
  const groups = new Map<string, Map<string, number>>()
  for (const raw of answers) {
    const text = raw.trim()
    if (!text) continue
    const k = answerKey(text)
    const spellings = groups.get(k) ?? new Map<string, number>()
    spellings.set(text, (spellings.get(text) ?? 0) + 1)
    groups.set(k, spellings)
  }
  return [...groups.values()]
    .map((spellings) => {
      const [answer] = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      return { answer, count: [...spellings.values()].reduce((n, c) => n + c, 0) }
    })
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
    .slice(0, limit)
}
