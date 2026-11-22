/**
 * The demo session ("Calc I — Chain Rule Review"): 3 chain-rule problems,
 * plus a realistic class's answers for evaluating and demoing clustering.
 *
 * Each response is tagged with the misconception it was WRITTEN to show
 * (`intended`), so the clustering eval can score how well the AI's groups
 * match a tutor's reading of the room — not just whether labels sound nice.
 * Answers and explanations are written the way students actually type them.
 */

export const DEMO_TITLE = 'Calc I — Chain Rule Review'

export interface DemoResponse {
  answer: string
  explanation: string
  /** The misconception this answer was written to show; 'correct' for right answers. */
  intended: string
}

export interface DemoProblem {
  prompt: string
  answer: string
  mistakes: string
  responses: DemoResponse[]
}

export const DEMO_PROBLEMS: DemoProblem[] = [
  {
    prompt: '\\frac{d}{dx}\\sin(3x^2)',
    answer: '6x*cos(3x^2)',
    mistakes: 'Forgetting to multiply by the inner derivative 6x',
    responses: [
      { answer: 'cos(3x^2)', explanation: 'derivative of sin is cos', intended: 'no-inner-derivative' },
      { answer: 'cos(3x²)', explanation: 'sin goes to cos', intended: 'no-inner-derivative' },
      { answer: 'cos(3x^2)', explanation: 'just took the derivative of the sin part', intended: 'no-inner-derivative' },
      { answer: 'cos 3x^2', explanation: 'd/dx sin u = cos u', intended: 'no-inner-derivative' },
      { answer: 'cos(3x^2)', explanation: 'outside function first, inside stays the same', intended: 'no-inner-derivative' },
      { answer: 'cos(6x)', explanation: 'took the derivative of the inside first', intended: 'differentiated-inside-of-function' },
      { answer: 'cos(6x)', explanation: 'differentiate whats in the brackets then cos', intended: 'differentiated-inside-of-function' },
      { answer: '6x', explanation: 'derivative of 3x^2 is 6x', intended: 'differentiated-inside-of-function' },
      { answer: '-6x*cos(3x^2)', explanation: 'derivative of sin is negative cos', intended: 'sign-error' },
      { answer: '-cos(3x^2)*6x', explanation: 'sin -> -cos then times 6x', intended: 'sign-error' },
      { answer: '6x*sin(3x^2)', explanation: 'multiply by the derivative of the inside', intended: 'kept-outer-function' },
      { answer: 'idk', explanation: '', intended: 'other' },
      { answer: '6x cos(3x²)', explanation: 'chain rule, outside derivative times inside derivative', intended: 'correct' },
      { answer: 'cos(3x^2)*6x', explanation: 'cos of the inside times 6x', intended: 'correct' },
    ],
  },
  {
    prompt: '\\frac{d}{dx}(2x+1)^5',
    answer: '10*(2x+1)^4',
    mistakes: 'Forgetting the factor 2 from the inner function',
    responses: [
      { answer: '5(2x+1)^4', explanation: 'power rule, bring the 5 down', intended: 'no-inner-derivative' },
      { answer: '5(2x+1)^4', explanation: 'n times x to the n-1', intended: 'no-inner-derivative' },
      { answer: '5*(2x+1)^4', explanation: 'bring down the power and subtract 1', intended: 'no-inner-derivative' },
      { answer: '5(2x+1)^4', explanation: 'same as x^5 but with 2x+1', intended: 'no-inner-derivative' },
      { answer: '10(2x+1)^5', explanation: 'multiply by 5 and by 2', intended: 'exponent-not-lowered' },
      { answer: '5*2*(2x+1)^5', explanation: 'chain rule gives the 2', intended: 'exponent-not-lowered' },
      { answer: '5(2x+1)^4*2x', explanation: 'times the derivative of the inside', intended: 'wrong-inner-derivative' },
      { answer: '10x(2x+1)^4', explanation: 'derivative of 2x+1 is 2x', intended: 'wrong-inner-derivative' },
      { answer: '32x^5', explanation: 'expanded it first', intended: 'other' },
      { answer: '10(2x+1)^4', explanation: 'power rule then times 2 from the inside', intended: 'correct' },
      { answer: '10*(2x+1)^4', explanation: 'chain rule', intended: 'correct' },
    ],
  },
  {
    prompt: '\\frac{d}{dx}e^{x^2}',
    answer: '2x*e^(x^2)',
    mistakes: 'Writing e^(x^2) unchanged because e^x is its own derivative',
    responses: [
      { answer: 'e^(x^2)', explanation: 'e^x is its own derivative', intended: 'no-inner-derivative' },
      { answer: 'e^(x^2)', explanation: 'derivative of e to anything is the same', intended: 'no-inner-derivative' },
      { answer: 'e^(x^2)', explanation: 'e stays e', intended: 'no-inner-derivative' },
      { answer: 'e^{x^2}', explanation: 'exponential doesnt change', intended: 'no-inner-derivative' },
      { answer: 'x^2*e^(x^2-1)', explanation: 'power rule on the exponent', intended: 'power-rule-on-exponential' },
      { answer: 'x^2 e^(x^2-1)', explanation: 'bring the power down', intended: 'power-rule-on-exponential' },
      { answer: 'e^(2x)', explanation: 'the exponent becomes its derivative', intended: 'differentiated-exponent-in-place' },
      { answer: '2x*e^(2x)', explanation: 'differentiate the exponent, chain rule', intended: 'differentiated-exponent-in-place' },
      { answer: '2x', explanation: 'derivative of x^2', intended: 'dropped-the-exponential' },
      { answer: '2x*e^(x^2)', explanation: 'e^u times u prime', intended: 'correct' },
      { answer: '2xe^(x^2)', explanation: 'chain rule', intended: 'correct' },
    ],
  },
]
