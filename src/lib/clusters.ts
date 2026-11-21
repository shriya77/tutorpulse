/**
 * Validation and fallback for misconception clusters (F9).
 *
 * The model's output is untrusted: it can be the right shape and still drop,
 * duplicate or invent submission ids, or return an over-long label (the
 * Phase 0 spike returned an 8-word label). `validateClusters` enforces the
 * rules in REQUIREMENTS → "Rules of the core loop":
 *   - every wrong submission appears in exactly one cluster ("Other" allowed);
 *   - no unknown ids, no empty clusters;
 *   - labels are 1–6 words.
 * If the model fails twice, `fallbackClusters` groups identical answers, so
 * the tutor's board always shows something.
 */

import { z } from 'zod'

export const MAX_LABEL_WORDS = 6
export const OTHER_LABEL = 'Other'

export const clusterOutputSchema = z.object({
  clusters: z.array(
    z.object({
      label: z.string(),
      explanation: z.string(),
      submissionIds: z.array(z.string()),
    }),
  ),
})

export type ClusterOutput = z.infer<typeof clusterOutputSchema>

export interface ValidCluster {
  label: string
  explanation: string
  submissionIds: string[]
}

export type ValidationResult = { ok: true; clusters: ValidCluster[] } | { ok: false; reason: string }

export function wordCount(label: string): number {
  return label.trim().split(/\s+/).filter(Boolean).length
}

/** Check model output against the set of wrong submission ids it was given. */
export function validateClusters(output: unknown, wrongIds: readonly string[]): ValidationResult {
  const parsed = clusterOutputSchema.safeParse(output)
  if (!parsed.success) return { ok: false, reason: 'shape: output does not match { clusters: [...] }' }

  const expected = new Set(wrongIds)
  const seen = new Set<string>()
  const labels = new Set<string>()
  const clusters: ValidCluster[] = []

  for (const c of parsed.data.clusters) {
    const label = c.label.trim()
    const words = wordCount(label)
    if (words === 0) return { ok: false, reason: 'label: empty label' }
    if (words > MAX_LABEL_WORDS) return { ok: false, reason: `label: "${label}" has ${words} words (max ${MAX_LABEL_WORDS})` }
    if (labels.has(label.toLowerCase())) return { ok: false, reason: `label: duplicate label "${label}"` }
    labels.add(label.toLowerCase())
    if (c.submissionIds.length === 0) return { ok: false, reason: `ids: cluster "${label}" is empty` }
    for (const id of c.submissionIds) {
      if (!expected.has(id)) return { ok: false, reason: `ids: unknown submission id ${id}` }
      if (seen.has(id)) return { ok: false, reason: `ids: submission ${id} appears more than once` }
      seen.add(id)
    }
    clusters.push({ label, explanation: c.explanation.trim(), submissionIds: [...c.submissionIds] })
  }

  const missing = wrongIds.filter((id) => !seen.has(id))
  if (missing.length > 0) return { ok: false, reason: `ids: ${missing.length} submission(s) missing, e.g. ${missing[0]}` }

  return { ok: true, clusters: sortClusters(clusters) }
}

/** Biggest cluster first; "Other" always last. */
export function sortClusters(clusters: ValidCluster[]): ValidCluster[] {
  return [...clusters].sort((a, b) => {
    const aOther = a.label === OTHER_LABEL ? 1 : 0
    const bOther = b.label === OTHER_LABEL ? 1 : 0
    return aOther - bOther || b.submissionIds.length - a.submissionIds.length || a.label.localeCompare(b.label)
  })
}

/** Canonical form for "identical answer" grouping: case, spaces and unicode-insensitive. */
export function normalizeAnswerText(answer: string): string {
  return answer
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[·×∙⋅]/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
}

/** Deterministic fallback: one cluster per distinct (normalized) answer. */
export function fallbackClusters(submissions: ReadonlyArray<{ id: string; answer: string }>): ValidCluster[] {
  const groups = new Map<string, { display: string; ids: string[] }>()
  for (const s of submissions) {
    const key = normalizeAnswerText(s.answer) || '(blank)'
    const group = groups.get(key) ?? { display: s.answer.trim() || '(blank)', ids: [] }
    group.ids.push(s.id)
    groups.set(key, group)
  }
  return sortClusters(
    [...groups.values()].map((g) => {
      const shown = g.display.replace(/\s+/g, '').slice(0, 24)
      return {
        label: `Answered ${shown}`,
        explanation: 'Grouped by identical answer because AI grouping was unavailable for this run.',
        submissionIds: g.ids,
      }
    }),
  )
}
