import { describe, expect, it } from 'vitest'
import { fallbackClusters, validateClusters, wordCount } from './clusters'

/** T7 — cluster output validation, including bad AI JSON. */
describe('validateClusters (T7)', () => {
  const ids = ['s1', 's2', 's3', 's4']
  const good = {
    clusters: [
      { label: 'Dropped the inner derivative', explanation: 'Stopped at cos.', submissionIds: ['s1', 's2'] },
      { label: 'Differentiated the inside only', explanation: 'Changed the argument.', submissionIds: ['s3'] },
      { label: 'Other', explanation: 'Misc.', submissionIds: ['s4'] },
    ],
  }

  it('accepts output that covers every wrong submission exactly once', () => {
    const r = validateClusters(good, ids)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.clusters.map((c) => c.label)).toEqual([
      'Dropped the inner derivative',
      'Differentiated the inside only',
      'Other',
    ])
  })

  it.each([
    ['not an object', 'cos(3x^2)'],
    ['null', null],
    ['missing clusters key', { groups: [] }],
    ['wrong field types', { clusters: [{ label: 3, explanation: '', submissionIds: 's1' }] }],
    ['raw JSON text instead of an object', JSON.stringify(good)],
  ])('rejects malformed output: %s', (_name, output) => {
    const r = validateClusters(output, ids)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/^shape/)
  })

  it('rejects a missing submission', () => {
    const r = validateClusters({ clusters: good.clusters.slice(0, 2) }, ids)
    expect(r).toEqual({ ok: false, reason: 'ids: 1 submission(s) missing, e.g. s4' })
  })

  it('rejects a duplicated submission', () => {
    const dup = { clusters: [...good.clusters, { label: 'Sign error', explanation: '', submissionIds: ['s1'] }] }
    expect(validateClusters(dup, ids)).toEqual({ ok: false, reason: 'ids: submission s1 appears more than once' })
  })

  it('rejects an invented submission id', () => {
    const bad = { clusters: [{ label: 'Other', explanation: '', submissionIds: [...ids, 's99'] }] }
    expect(validateClusters(bad, ids)).toEqual({ ok: false, reason: 'ids: unknown submission id s99' })
  })

  it('rejects labels over 6 words (the Phase 0 spike produced one)', () => {
    const long = {
      clusters: [{ label: 'Wrong sign: derivative of sin as negative cos', explanation: '', submissionIds: ids }],
    }
    const r = validateClusters(long, ids)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/has 8 words/)
  })

  it('drops empty clusters instead of rejecting the run (seen in real model output)', () => {
    const r = validateClusters({ clusters: [...good.clusters, { label: 'Extra', explanation: '', submissionIds: [] }] }, ids)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.clusters.map((c) => c.label)).not.toContain('Extra')
  })

  it('rejects blank labels and duplicate labels', () => {
    expect(validateClusters({ clusters: [{ label: '  ', explanation: '', submissionIds: ids }] }, ids).ok).toBe(false)
    const twice = { clusters: [
      { label: 'Other', explanation: '', submissionIds: ['s1', 's2'] },
      { label: 'other', explanation: '', submissionIds: ['s3', 's4'] },
    ] }
    expect(validateClusters(twice, ids).ok).toBe(false)
  })

  it('accepts zero clusters only when there are no wrong submissions', () => {
    expect(validateClusters({ clusters: [] }, []).ok).toBe(true)
    expect(validateClusters({ clusters: [] }, ids).ok).toBe(false)
  })
})

describe('house style', () => {
  it('removes em and en dashes from labels and explanations', () => {
    const r = validateClusters(
      { clusters: [{ label: 'Forgot the ×6x — inside', explanation: 'Wrote cos(3x^2) – no 6x. Try asking: why?', submissionIds: ['s1'] }] },
      ['s1'],
    )
    expect(r.ok && r.clusters[0]).toMatchObject({ label: 'Forgot the ×6x, inside', explanation: 'Wrote cos(3x^2), no 6x. Try asking: why?' })
  })
})

describe('fallbackClusters', () => {
  it('groups identical answers, ignoring case, spacing and unicode dots', () => {
    const clusters = fallbackClusters([
      { id: 's1', answer: 'cos(3x^2)' },
      { id: 's2', answer: 'COS( 3x^2 )' },
      { id: 's3', answer: '6x·cos(x^2)' },
      { id: 's4', answer: '6x*cos(x^2)' },
      { id: 's5', answer: 'idk' },
      { id: 's6', answer: 'cos{3x^2}' },
    ])
    const groups = clusters.map((c) => c.submissionIds.join(',')).sort()
    expect(groups).toEqual(['s1,s2,s6', 's3,s4', 's5'])
    // Largest groups first; the singleton is last.
    expect(clusters.at(-1)?.submissionIds).toEqual(['s5'])
  })

  it('always produces output that passes validation', () => {
    const subs = [
      { id: 'a', answer: 'a very long answer with lots of words in it that goes on' },
      { id: 'b', answer: '' },
      { id: 'c', answer: 'x' },
    ]
    const clusters = fallbackClusters(subs)
    for (const c of clusters) expect(wordCount(c.label)).toBeLessThanOrEqual(6)
    expect(validateClusters({ clusters }, subs.map((s) => s.id)).ok).toBe(true)
  })
})
