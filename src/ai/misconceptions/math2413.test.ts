import { describe, expect, it } from 'vitest'
import { TOPICS } from '../../lib/topics'
import { buildClusterPrompt } from '../prompts/cluster'
import { MATH2413_MISCONCEPTIONS, misconceptionsFor } from './math2413'

describe('Calc I misconception library', () => {
  it('has a non-empty list for every pickable topic, and nothing else', () => {
    expect(Object.keys(MATH2413_MISCONCEPTIONS).sort()).toEqual(TOPICS.map((t) => t.id).sort())
    for (const t of TOPICS) expect(misconceptionsFor(t.id).length).toBeGreaterThan(40)
  })

  it('prefixes each entry with its section', () => {
    expect(misconceptionsFor('math2413-w4')).toContain(
      'Basic differentiation: Differentiating each factor of a product and multiplying the results',
    )
  })

  it('returns nothing for no topic or an unknown one', () => {
    expect(misconceptionsFor(undefined)).toEqual([])
    expect(misconceptionsFor('')).toEqual([])
    expect(misconceptionsFor('constructor')).toEqual([])
  })

  it('contains no em or en dashes (house style)', () => {
    expect(JSON.stringify(MATH2413_MISCONCEPTIONS)).not.toMatch(/[—–]/)
  })

  it('comes after the submissions in the prompt', () => {
    const p = buildClusterPrompt({ problemPrompt: 'p', answerKey: 'a', existingLabels: [], submissions: [{ id: 's1', answer: 'x', explanation: '' }], topicMisconceptions: ['m'] })
    expect(p.indexOf('wrongSubmissions')).toBeLessThan(p.indexOf('knownMisconceptions'))
  })

  it('is included in the clustering prompt only when a topic is set', () => {
    const base = { problemPrompt: 'p', answerKey: 'a', existingLabels: [], submissions: [] }
    expect(buildClusterPrompt(base)).not.toContain('knownMisconceptions')
    expect(buildClusterPrompt({ ...base, topicMisconceptions: misconceptionsFor('math2413-w4') })).toContain('knownMisconceptions')
  })
})
