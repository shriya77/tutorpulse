/**
 * Whiteboard evaluation set: does reading students' handwritten working
 * group them better than the typed answer and one-line note alone?
 *
 * Built so the typed data is NOT enough, the way it often isn't in a real
 * room: notes are vague ("quotient rule", blank), and the same wrong final
 * answer comes from different mistakes (7/(x-3)^2 from swapping the
 * numerator's order OR from dropping the final minus sign), while one
 * mistake gives different answers (bad algebra after a correct product
 * rule). `working` is what the student wrote on the pad, line by line; the
 * eval renders it as a handwriting-style PNG.
 */

import type { DemoProblem, DemoResponse } from './chain-rule-demo'

export type WorkingResponse = DemoResponse & { working?: string[] }
export type WorkingProblem = Omit<DemoProblem, 'responses'> & { responses: WorkingResponse[] }

export const WORKING_PROBLEMS: WorkingProblem[] = [
  {
    prompt: '\\frac{d}{dx}\\,\\frac{2x+1}{x-3}',
    answer: '-7/(x-3)^2',
    mistakes: 'Order of the quotient rule numerator',
    responses: [
      {
        answer: '7/(x-3)^2', explanation: 'quotient rule', intended: 'swapped-numerator-order',
        working: ['f = 2x+1,  g = x-3', "f' = [ (2x+1)(1) - (x-3)(2) ] / (x-3)²", '   = (2x + 1 - 2x + 6) / (x-3)²', '   = 7 / (x-3)²'],
      },
      {
        answer: '7/(x-3)^2', explanation: '', intended: 'swapped-numerator-order',
        working: ['top = 2x+1   bottom = x-3', "( top · bottom'  -  bottom · top' ) / bottom²", '= ( (2x+1)·1 - (x-3)·2 ) / (x-3)²', '= 7/(x-3)²'],
      },
      {
        answer: '7/(x^2-6x+9)', explanation: 'simplified it', intended: 'swapped-numerator-order',
        working: ["y' = ((2x+1)(1) - 2(x-3)) / (x-3)²", '   = (2x+1-2x+6) / (x²-6x+9)', '   = 7/(x²-6x+9)'],
      },
      {
        answer: '7/(x-3)^2', explanation: 'quotient rule', intended: 'dropped-final-sign',
        working: ["f' = [ 2(x-3) - (2x+1)(1) ] / (x-3)²", '   = (2x - 6 - 2x - 1) / (x-3)²', '   = -7 / (x-3)²', '   = 7/(x-3)²   (squared so its positive)'],
      },
      {
        answer: '7/(x-3)^2', explanation: 'low d high minus high d low', intended: 'dropped-final-sign',
        working: ['(x-3)(2) - (2x+1)(1)', '------------------------', '        (x-3)²', '= (2x-6-2x-1)/(x-3)² = -7/(x-3)²', 'denominator always + so answer = 7/(x-3)²'],
      },
      {
        answer: '-5/(x-3)^2', explanation: 'quotient rule', intended: 'minus-not-distributed',
        working: ["f' = [ 2(x-3) - (2x+1) ] / (x-3)²", '   = (2x - 6 - 2x + 1) / (x-3)²', '   = -5/(x-3)²'],
      },
      {
        answer: '-5/(x-3)^2', explanation: '', intended: 'minus-not-distributed',
        working: ['(2)(x-3) - (2x+1)(1)  over  (x-3)²', '= 2x - 6 - 2x + 1', '= -5', "f'(x) = -5/(x-3)²"],
      },
      {
        answer: '-7/(x-3)', explanation: 'quotient rule', intended: 'denominator-not-squared',
        working: ["f' = [ 2(x-3) - (2x+1)(1) ] / (x-3)", '   = (2x-6-2x-1)/(x-3)', '   = -7/(x-3)'],
      },
      {
        answer: '-7/(x-3)', explanation: 'idk', intended: 'denominator-not-squared',
        working: ['low dhigh - high dlow / low', '= (x-3)(2) - (2x+1)(1)  /  (x-3)', '= -7/(x-3)'],
      },
      { answer: '-7/(x-3)^2', explanation: 'quotient rule', intended: 'correct', working: ["f' = [2(x-3) - (2x+1)] / (x-3)²", '= -7/(x-3)²'] },
    ],
  },
  {
    prompt: '\\frac{d}{dx}\\,x^2 e^{3x}',
    answer: '2x*e^(3x) + 3x^2*e^(3x)',
    mistakes: 'Forgetting the chain rule on e^(3x)',
    responses: [
      {
        answer: '2x e^(3x) + x^2 e^(3x)', explanation: 'product rule', intended: 'no-chain-on-exponential',
        working: ["(x²)' e^(3x) + x² (e^(3x))'", '= 2x e^(3x) + x² e^(3x)'],
      },
      {
        answer: 'x e^(3x) (2 + x)', explanation: 'product rule then factor', intended: 'no-chain-on-exponential',
        working: ["u = x²  u' = 2x", "v = e^(3x)  v' = e^(3x)", "u'v + uv' = 2x e^(3x) + x² e^(3x)", '= x e^(3x)(2 + x)'],
      },
      {
        answer: '2x e^(3x) + x^2 e^(3x)', explanation: '', intended: 'no-chain-on-exponential',
        working: ['d/dx e^(3x) = e^(3x)', 'so  2x·e^(3x) + x²·e^(3x)'],
      },
      {
        answer: '6x e^(3x)', explanation: 'product rule', intended: 'multiplied-derivatives',
        working: ["(x²)' = 2x", "(e^(3x))' = 3e^(3x)", 'multiply:  2x · 3e^(3x) = 6x e^(3x)'],
      },
      {
        answer: '6x e^(3x)', explanation: 'derivative of each', intended: 'multiplied-derivatives',
        working: ["y' = (2x)(3e^(3x))", '   = 6x e^(3x)'],
      },
      {
        answer: '5x^3 e^(3x)', explanation: 'product rule', intended: 'combined-unlike-terms',
        working: ["u'v + uv' = 2x e^(3x) + x²·3e^(3x)", '= 2x e^(3x) + 3x² e^(3x)', '= 5x³ e^(3x)'],
      },
      {
        answer: '5x^2 e^(3x)', explanation: 'product + chain', intended: 'combined-unlike-terms',
        working: ["= 2x·e^(3x) + x²·3e^(3x)", '= e^(3x) (2x + 3x²)', '= e^(3x) · 5x²', '= 5x² e^(3x)'],
      },
      {
        answer: '2x e^(3x) + 3x^2 e^(3x)', explanation: 'product rule and chain rule', intended: 'correct',
        working: ["2x·e^(3x) + x²·3e^(3x)"],
      },
    ],
  },
]
