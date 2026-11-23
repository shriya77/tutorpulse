# Real-handwriting trial (about 10 minutes, needs you)

Every whiteboard result so far used typed text in a handwriting font. This checks what the AI makes of **real** handwriting, on the pad and on paper. It spends 2–3 small AI calls.

## Setup (laptop)

1. Open https://tutorpulse.app.space/home on your laptop, signed in as yourself (the tutor).
2. Create a session called "Handwriting trial" with this problem:
   - Problem: `\frac{d}{dx}\,\frac{2x+1}{x-3}`
   - Answer: `-7/(x-3)^2`
   - Expected mistakes: leave empty (so the AI isn't helped).
3. Click **Open session**.

## As students (phone, plus one more browser)

Use your phone and one other browser or window (a private window works), joined with the code as two different accounts. Your own account counts as the tutor, so use the test accounts `student-a-00ef20@deepspace.test` and `student-b-00ef20@deepspace.test`. Their password is in `~/.deepspace/test-accounts.json` (`npx deepspace test accounts list --reveal`).

| Student | Where | Write this working | Final answer |
| --- | --- | --- | --- |
| A | phone, **on the pad** with your finger | `(2x+1)(1) - (x-3)(2)` over `(x-3)²`, then `= 7/(x-3)²` (top terms in the wrong order) | `7/(x-3)^2` |
| B | **on paper**, then "Use a photo of paper instead" | `2(x-3) - (2x+1)` over `(x-3)²` = `-7/(x-3)²`, then cross out the minus: "squared, so positive" | `7/(x-3)^2` |

Leave "How did you get it?" empty for both (it disappears once there's working anyway).

## What to look at (laptop)

Both students have the **same wrong answer**. With the typed answer alone they'd be one group.

- **Pass:** two groups, one about the order of the top terms and one about dropping the minus sign, and the explanations mention a step from the working.
- **Partial:** one group, but the explanation describes a step that only appears in someone's working.
- **Fail:** one generic group ("Wrong sign") with nothing from the working, or a mistake that isn't on the page.

Also check: the thumbnails are readable, the photo is upright, and on the phone the pad felt usable.

## Then

Tell Claude what you saw (or paste a screenshot). It will add the result to `docs/clustering-eval/` and the README, replacing "not tried with real handwriting".
