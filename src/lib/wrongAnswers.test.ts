import { describe, expect, it } from 'vitest'
import { commonWrongAnswers } from './wrongAnswers'

describe('commonWrongAnswers', () => {
  it('merges spacing, case, * and minus variants, keeps the commonest spelling', () => {
    expect(commonWrongAnswers(['cos(3x^2)', 'cos(3x^2)', 'COS(3x^2) ', '6x', '6 * x', '−2', 'lonely'])).toEqual([
      { answer: 'cos(3x^2)', count: 3 },
      { answer: '6 * x', count: 2 },
    ])
  })
  it('never lists an answer only one student gave', () => {
    expect(commonWrongAnswers(['a', 'b', 'c'])).toEqual([])
  })
  it('caps the list', () => {
    expect(commonWrongAnswers(['1', '1', '2', '2', '3', '3', '4', '4'], 3)).toHaveLength(3)
  })
})
