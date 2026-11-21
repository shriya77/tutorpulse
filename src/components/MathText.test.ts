import { describe, expect, it } from 'vitest'
import { splitMath } from './MathText'

describe('splitMath', () => {
  it('treats a prompt without $ as one expression', () => {
    expect(splitMath('\\frac{d}{dx}\\sin(3x^2)')).toEqual([{ math: true, text: '\\frac{d}{dx}\\sin(3x^2)' }])
  })

  it('splits text and $…$ math', () => {
    expect(splitMath('Differentiate $\\sin(3x^2)$ now')).toEqual([
      { math: false, text: 'Differentiate ' },
      { math: true, text: '\\sin(3x^2)' },
      { math: false, text: ' now' },
    ])
  })

  it('keeps an unterminated $ as text', () => {
    expect(splitMath('Find $x$ and $oops')).toEqual([
      { math: false, text: 'Find ' },
      { math: true, text: 'x' },
      { math: false, text: ' and ' },
      { math: false, text: '$oops' },
    ])
  })
})
