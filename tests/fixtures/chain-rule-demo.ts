/**
 * The demo session ("Calc I — Chain Rule Review"): 3 chain-rule problems.
 * Shared by the dev-only seed script (problems + keys only) and the
 * clustering evaluation (plus realistic student responses).
 */

export const DEMO_TITLE = 'Calc I — Chain Rule Review'

export interface DemoProblem {
  prompt: string
  answer: string
  mistakes: string
  /** Realistic class responses for the clustering eval (some are correct). */
  responses: Array<{ answer: string; explanation: string }>
}

export const DEMO_PROBLEMS: DemoProblem[] = [
  {
    prompt: '\\frac{d}{dx}\\sin(3x^2)',
    answer: '6x*cos(3x^2)',
    mistakes: 'Forgetting to multiply by the inner derivative 6x',
    responses: [
      { answer: 'cos(3x^2)', explanation: 'derivative of sin is cos' },
      { answer: 'cos(3x^2)', explanation: 'sin turns into cos, inside stays the same' },
      { answer: 'cos(3x²)', explanation: 'd/dx sin u = cos u' },
      { answer: '6x*cos(x^2)', explanation: 'derivative of 3x^2 is 6x so I pulled it out' },
      { answer: 'cos(6x)', explanation: 'took the derivative of the inside first' },
      { answer: '-6x*cos(3x^2)', explanation: 'chain rule, derivative of sin is -cos' },
      { answer: '6x*sin(3x^2)', explanation: 'brought down the derivative of the inside' },
      { answer: '6x*cos(3x^2)', explanation: 'outer derivative times inner derivative' },
    ],
  },
  {
    prompt: '\\frac{d}{dx}(2x+1)^5',
    answer: '10*(2x+1)^4',
    mistakes: 'Forgetting the factor 2 from the inner function',
    responses: [
      { answer: '5(2x+1)^4', explanation: 'power rule, bring the 5 down' },
      { answer: '5(2x+1)^4', explanation: 'n x^(n-1)' },
      { answer: '5*(2x+1)^4*2x', explanation: 'chain rule times derivative of inside' },
      { answer: '10(2x+1)^5', explanation: 'multiply by 5 and by 2' },
      { answer: '(2x+1)^4*2', explanation: 'reduce power by one and multiply by 2' },
      { answer: '5(2)^4', explanation: 'derivative of 2x+1 is 2 so plug in 2' },
      { answer: '10*(2x+1)^4', explanation: 'power rule then times 2 for the inside' },
    ],
  },
  {
    prompt: '\\frac{d}{dx}e^{x^2}',
    answer: '2x*e^(x^2)',
    mistakes: 'Writing e^(x^2) unchanged because e^x is its own derivative',
    responses: [
      { answer: 'e^(x^2)', explanation: 'e^x is its own derivative' },
      { answer: 'e^(x^2)', explanation: 'derivative of e to anything is the same' },
      { answer: 'x^2*e^(x^2-1)', explanation: 'power rule on the exponent' },
      { answer: '2x*e^(2x)', explanation: 'differentiate the exponent' },
      { answer: '2*e^(x^2)', explanation: 'derivative of x^2 is 2' },
      { answer: 'e^(2x)', explanation: 'the exponent becomes its derivative' },
      { answer: '2x*e^(x^2)', explanation: 'chain rule: e^u times u prime' },
    ],
  },
]
