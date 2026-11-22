/**
 * Prompt for the practice-set PDF (F15), run in Anthropic's code-execution
 * sandbox. The input is `summary.json` (no student names or ids): problems,
 * correct rates and the top misconceptions with a few example wrong answers.
 */

export const PRACTICE_SET_FILENAME = 'practice-set.pdf'

export const PRACTICE_SET_TASK = `You are preparing a printable practice set for a tutoring group that just finished a live session.

The attached file summary.json contains:
- "title": the session title
- "problems": [{ "number", "prompt" (LaTeX), "answer", "submitted", "correct", "correctRate" }]
- "misconceptions": the most common mistakes, biggest first: [{ "label", "explanation", "students", "problemNumber", "exampleWrongAnswers" }]

Using Python in the sandbox, write ONE PDF named ${PRACTICE_SET_FILENAME}:

1. Title page header: the session title and "Practice set".
2. A matplotlib bar chart of correct rate (0 to 100%) per problem ("P1", "P2", …), each bar labelled with its percentage. Use a single neutral colour.
3. For each misconception (at most 3), a short heading with its label, one sentence on the idea to watch, then 2 or 3 NEW practice problems that target exactly that mistake. They must be different from the session's problems but the same topic and difficulty. Number them consecutively.
   If "misconceptions" is empty, write 3 new problems per session problem instead.
4. A final page titled "Answers" with the answer to every practice problem, in the same numbering.

Rules:
- Write maths with matplotlib mathtext (e.g. r"$\\frac{d}{dx}\\sin(5x^3)$"), not raw LaTeX source. Double-check every answer you write.
- Never include student names or anything that identifies a student.
- Never use em dashes (—) or en dashes (–); use a comma, colon or full stop instead.
- Keep it to at most 4 pages. Use matplotlib's PdfPages (reportlab only if it is installed).
- Save the PDF directly in $OUTPUT_DIR and list $OUTPUT_DIR in the same bash command. Do not create any other files in $OUTPUT_DIR.`
