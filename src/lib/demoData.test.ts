import { describe, expect, it } from 'vitest'
import { DEMO_PROBLEMS } from '../../tests/fixtures/chain-rule-demo'
import { PLTL_WEEK4_PROBLEMS } from '../../tests/fixtures/pltl-week4'
import { checkAnswer } from './answerCheck'

/** The demo class data must agree with the deterministic checker. */
describe('demo class data vs the answer checker', () => {
  for (const [i, p] of [...DEMO_PROBLEMS, ...PLTL_WEEK4_PROBLEMS].entries()) {
    it(`problem ${i + 1} (${p.prompt}): tagged-correct answers check as correct, everything else does not`, () => {
      for (const r of p.responses) {
        const verdict = checkAnswer(r.answer, p.answer).verdict
        if (r.intended === 'correct') expect({ answer: r.answer, verdict }).toEqual({ answer: r.answer, verdict: 'correct' })
        else expect({ answer: r.answer, verdict }).not.toEqual({ answer: r.answer, verdict: 'correct' })
      }
    })
  }
})
