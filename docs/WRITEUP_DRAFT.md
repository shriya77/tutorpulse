# TutorPulse: writeup

## 1. What I built

In group tutoring, most wrong answers share a few root causes, but the tutor sees them one desk at a time. **TutorPulse** is a live room for group tutoring. Students join from a phone with a code or QR, write their working on a sketch pad and type a final answer. Answers are checked exactly, and AI groups the wrong ones into named misconceptions ("Forgot the inner derivative · 3") on the tutor's board while the session runs. The tutor takes a group to the board, students revise, and a follow-up problem checks whether the mistake really cleared. Afterwards students get a practice set aimed at the room's real mistakes.

**Scope:** the core loop shipped as planned. Once it was solid I grew the app toward what a tutor needs before and after a session: history across sessions, a weekly digest, session reports, a problem bank and timers.

- Live: **https://tutorpulse.app.space** · 2-minute demo video: `docs/demo/tutorpulse-demo.mp4`
- Test accounts: `tutor-1@deepspace.test` (tutor) and seven students (Maya, Jordan, Priya, Leo, Sam, A, B); passwords are in the submission form. To see groups appear, sign in as the tutor in one window and as two or three students in others (private windows or a phone), and give the same wrong answer twice.

## 2. DeepSpace primitives used

- **AI via the DeepSpace proxy:** Claude Haiku groups wrong answers from the typed answer and the handwritten working, with validation and a fallback.
- **AI chat, custom tools and managed knowledge:** a Socratic hint assistant that reads the current problem and searches the tutor's notes.
- **LaTeX compiler:** a background job typesets the practice-set PDF, with the **Anthropic sandbox** as the fallback.
- **Email and scheduled tasks:** opt-in recap emails for students and an opt-in weekly digest for tutors.
- **Platform:** auth, row-level permissions, real-time sync, server actions, presence, background jobs, private file storage, the multi-user test fixture and deploy.

Left out on purpose: video and messaging (tutoring already happens in the room or on Zoom), payments (peer tutoring is free) and collaborative text (a shared editor would break the grouping).

## 3. Main tradeoff

**AI explains wrong answers; it never grades them.** Correctness is a deterministic maths check (mathjs at 5 points), so the counts are exact, instant and free, and only wrong answers cost an AI call. It's also why the whiteboard doesn't replace the typed answer: grading handwriting would make the counts fuzzy. The cost is that only answers the checker can read (expressions, numbers, intervals, DNE) are auto-checked; anything else is marked "needs review".

## 4. Where the agent helped

- Found the npm bug behind the failed install after my first pass at it, and moved the app off a stale SDK version.
- Checked SDK calls against the installed types, with throwaway spikes for risky paths.
- Built the schemas, guards, actions, jobs, prompts, UI and tests (203 unit tests, 39 browser tests including privacy tests).
- Found security gaps beyond the spec, e.g. any member could enqueue jobs, and presence rooms admitted strangers.
- Built clustering evals: 0.95 → 1.00 after prompt tuning, and 0.92 without working images vs 1.00 with them.

## 5. What I verified, decided and changed

- **Set the rules:** wrote the requirements and build prompt, including the security rules and the dependency list.
- **Made the calls:** re-scaffold on the new SDK, owner-billed hints, LaTeX and email as the integrations, and which fixes to build from a review of the whole app.
- **Tested it myself:** joined a live session as a student, ran `sessionReport` against the live app and confirmed a real recap email arrived.
- **Fixed what I found using it:** an image-upload glitch on my laptop; on my phone, zoom and a drawing mode that locks the page, then a steadier two-finger move after testing it sideways.
- **Checked the agent's code:** had it review a day's 25 commits, then had all 10 findings fixed.
- **Changed the direction:** judged that the demo depends on clustering feeling smart and pushed the work there; asked for the restyle and cut jargon reviewers wouldn't know.
- **Brought the domain knowledge:** eight Calc I study-group packets (one worked by me) and my misconceptions write-up, which became the library behind the cluster labels.
- **Had the whiteboard idea:** group students by their written working, not a one-line reason, then dropped the redundant explanation box.

**Tried for real:** two students with the same wrong answer, one on the phone pad and one photographing paper, landed in the two right mistake groups from their handwriting alone. **Unfinished:** a real room of rushed handwriting, and the newest features pass their automated tests but I haven't tried them by hand yet; the README lists the rest. **Next:** a starter problem bank per course week, and LMS export.
