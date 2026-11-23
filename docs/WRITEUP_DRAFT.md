# TutorPulse: writeup (draft)

> Drafted by the coding agent from `docs/AGENT_LOG.md` and our chat. Section 5 is drawn from Shriya's own messages and decisions. Edit freely; the body is about 630 words.

## 1. What I built

In group tutoring, most wrong answers share a few root causes, but the tutor sees them one desk at a time. **TutorPulse** is a live room for group tutoring. Students join from a phone with a code or QR, write their working on a sketch pad and type a final answer. Answers are checked exactly, and the wrong ones are grouped by AI into named misconceptions ("Forgot the inner derivative · 3") on the tutor's board while the session runs. The tutor takes a group to the board, students revise, and a follow-up problem sent to that group checks whether the mistake really cleared. Afterwards students get a typeset practice set aimed at the room's real mistakes, and those who opted in get an email recap of their own results.

- Live: **https://tutorpulse.app.space** · 2-minute demo video: `docs/demo/tutorpulse-demo.mp4`
- Test accounts: `tutor-1@deepspace.test` (tutor) and seven students (Maya, Jordan, Priya, Leo, Sam, A, B). Passwords shared privately.

## 2. DeepSpace primitives used

- **AI via the DeepSpace proxy:** Claude Haiku groups wrong answers from the typed answer and the handwritten working, with validation and a fallback.
- **AI chat, custom tools and managed knowledge:** a Socratic hint assistant that reads the current problem and searches the tutor's indexed notes.
- **LaTeX compiler:** a background job typesets the practice-set PDF. Claude writes the problems, maths software works out the derivative answers, and the chart uses the session's exact numbers. The **Anthropic sandbox** (Python) is the fallback.
- **Email:** opt-in recap emails after the session, with only that student's own results.
- **Platform:** auth, row-level permissions, real-time sync, server actions, presence (live roster), background jobs, private file storage for working images, local agent tools, the multi-user test fixture and deploy.

Left out on purpose: video and messaging (tutoring already happens in the room or on Zoom), payments (peer tutoring is free) and collaborative text (answers are individual, and a shared editor would break the grouping).

## 3. Main tradeoff

**AI explains wrong answers; it never grades them.** Correctness is a deterministic maths check (mathjs at 5 points), so the counts are exact, instant and free, and only wrong answers cost an AI call. It's also why the whiteboard doesn't replace the typed answer: grading handwriting would make the counts fuzzy. The cost is that only answers the checker can read (expressions, numbers, intervals, DNE) are auto-checked; anything else is marked "needs review".

## 4. Where the agent helped

- Diagnosed the failed install and moved the app off a stale SDK version.
- Checked SDK calls against the installed types and proved risky paths with throwaway spikes first.
- Built the schemas, guards, actions, jobs, prompts, UI and tests (131 unit tests, 14 browser specs including privacy tests).
- Found security gaps beyond the spec, e.g. any member could enqueue or read jobs, and presence rooms admitted strangers.
- Built clustering evals scored against intended groups: 0.95 → 1.00 after prompt tuning; 1.00 on real Calc I study-group problems; 0.92 without working images vs 1.00 with them.

## 5. What I verified, decided and changed

- **Set the rules:** wrote the requirements and build prompt, including the security rules and the dependency list.
- **Made the calls:** re-scaffold on the new SDK, owner-billed hints, F17, and more accounts for a realistic room.
- **Tested it myself:** signed off Phase 0, joined a live session as a student, and ran `sessionReport` against the live app.
- **Changed the direction:** judged that the demo depends on clustering feeling smart and pushed the work there; asked for the restyle and for em dashes to go.
- **Brought the domain knowledge:** eight Calc I study-group problem packets (one worked by me) and my misconceptions write-up, which became the per-week library behind the cluster labels.
- **Had the whiteboard idea:** group students by their written working rather than a one-line reason. I then dropped the redundant explanation box.

**Unfinished:** the whiteboard and photo upload haven't been tried with real students' handwriting; the README's limitations list has the rest. **Next:** a weekly misconception digest.
