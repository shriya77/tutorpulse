/**
 * Session topics a tutor can pick (MATH 2413 PLTL weeks). Only ids and
 * labels live here so the browser bundle stays small; the misconception
 * lists themselves are server-only (src/ai/misconceptions/math2413.ts).
 */

export const TOPICS = [
  { id: 'math2413-w1', label: 'Week 1: Precalculus review and limits' },
  { id: 'math2413-w3', label: 'Week 3: Continuity, IVT and limits at infinity' },
  { id: 'math2413-w4', label: 'Week 4: Definition of the derivative and differentiation basics' },
  { id: 'math2413-w7', label: 'Week 7: Related rates, linear approximation and differentials' },
  { id: 'math2413-w8', label: 'Week 8: Extrema, Rolle’s Theorem and MVT' },
  { id: 'math2413-w9', label: 'Week 9: How derivatives affect the shape of a graph' },
  { id: 'math2413-w10', label: 'Week 10: L’Hôpital’s Rule and sketching graphs' },
  { id: 'math2413-w11', label: 'Week 11: Optimization, antiderivatives and areas' },
] as const

export type TopicId = (typeof TOPICS)[number]['id']

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === 'string' && TOPICS.some((t) => t.id === value)
}
