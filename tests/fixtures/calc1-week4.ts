/**
 * Real problems from Week 4 of a Calc I (MATH 2413) peer-led study-group
 * packet (problems 6c, 7e, 7c), with the packet's correct answers. The packets contain no student
 * work, so the wrong answers below are written to show the classic mistakes
 * for each problem, tagged like tests/fixtures/chain-rule-demo.ts. Used to
 * check the clustering prompt generalizes beyond the chain-rule demo.
 */
import type { DemoProblem } from './chain-rule-demo'

export const CALC1_WEEK4_PROBLEMS: DemoProblem[] = [
  {
    prompt: '\\frac{d}{dx}\\sqrt{x^2+2}',
    answer: 'x/sqrt(x^2+2)',
    mistakes: 'Forgetting the 2x from the inside; forgetting the 1/2',
    responses: [
      { answer: '1/(2sqrt(x^2+2))', explanation: 'derivative of sqrt is 1 over 2 sqrt', intended: 'no-inner-derivative' },
      { answer: '1/(2*sqrt(x^2+2))', explanation: 'power rule on the square root', intended: 'no-inner-derivative' },
      { answer: '1/(2√(x²+2))', explanation: 'd/dx sqrt(u) = 1/(2 sqrt u)', intended: 'no-inner-derivative' },
      { answer: '2x/sqrt(x^2+2)', explanation: 'times the derivative of the inside', intended: 'dropped-the-half' },
      { answer: '2x/(sqrt(x^2+2))', explanation: 'chain rule gives 2x on top', intended: 'dropped-the-half' },
      { answer: 'sqrt(2x)', explanation: 'differentiate inside first then take the root', intended: 'differentiated-inside-in-place' },
      { answer: '1/(2sqrt(2x))', explanation: 'derivative of x^2+2 is 2x so sqrt of that', intended: 'differentiated-inside-in-place' },
      { answer: 'x/sqrt(x^2+2)', explanation: '1/2 times 2x over the root', intended: 'correct' },
      { answer: 'x(x^2+2)^(-1/2)', explanation: 'chain rule', intended: 'correct' },
    ],
  },
  {
    prompt: '\\frac{d}{dx}\\left[(x^2-5x)(1-3x)\\right]',
    answer: '-9x^2+32x-5',
    mistakes: 'Multiplying the two derivatives; slips when expanding first',
    responses: [
      { answer: '(2x-5)(-3)', explanation: 'derivative of each bracket multiplied', intended: 'multiplied-derivatives' },
      { answer: '-6x+15', explanation: 'took the derivative of both and multiplied', intended: 'multiplied-derivatives' },
      { answer: '(2x-5)*(-3)', explanation: 'derivative of a product is the product of derivatives', intended: 'multiplied-derivatives' },
      { answer: '(2x-5)(1-3x)', explanation: 'product rule', intended: 'half-product-rule' },
      { answer: '(2x-5)(1-3x)', explanation: "f' times g", intended: 'half-product-rule' },
      { answer: '-9x^2+30x-5', explanation: 'expanded first then power rule', intended: 'expansion-slip' },
      { answer: '-9x^2+28x-5', explanation: 'multiplied out then differentiated', intended: 'expansion-slip' },
      { answer: '-9x^2+32x-5', explanation: 'expanded to -3x^3+16x^2-5x', intended: 'correct' },
      { answer: '(2x-5)(1-3x)+(x^2-5x)(-3)', explanation: "f'g + fg'", intended: 'correct' },
    ],
  },
  {
    prompt: '\\frac{d}{dx}\\,\\frac{2x^3-5x+2\\sqrt{x}}{\\sqrt{x}}',
    answer: '5x^(3/2)-5/(2*sqrt(x))',
    mistakes: 'Dividing the derivatives instead of simplifying first',
    responses: [
      { answer: '(6x^2-5+1/sqrt(x))/(1/(2sqrt(x)))', explanation: 'derivative of top over derivative of bottom', intended: 'divided-derivatives' },
      { answer: '(6x^2-5+x^(-1/2))/(0.5x^(-1/2))', explanation: 'differentiate numerator and denominator', intended: 'divided-derivatives' },
      { answer: '2sqrt(x)(6x^2-5+1/sqrt(x))', explanation: 'top derivative divided by bottom derivative', intended: 'divided-derivatives' },
      { answer: '5x^(5/2)-5/2*x^(1/2)', explanation: 'simplified then brought the power down', intended: 'exponent-not-lowered' },
      { answer: '5x^(5/2)-2.5sqrt(x)', explanation: 'power rule on each term', intended: 'exponent-not-lowered' },
      { answer: '2x^(5/2)-5x^(1/2)+2', explanation: 'simplified by dividing each term', intended: 'simplified-not-differentiated' },
      { answer: '5x^(3/2)-5/(2sqrt(x))+1', explanation: 'derivative of the 2 is 1', intended: 'derivative-of-constant' },
      { answer: '5x^(3/2)-5/(2sqrt(x))', explanation: 'split into 2x^(5/2) - 5x^(1/2) + 2 first', intended: 'correct' },
      { answer: '5x^1.5-2.5x^(-0.5)', explanation: 'simplified first', intended: 'correct' },
    ],
  },
]
