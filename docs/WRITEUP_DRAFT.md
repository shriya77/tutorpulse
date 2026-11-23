# TutorPulse: writeup (draft)

> Drafted by the coding agent from `docs/AGENT_LOG.md` and our chat. Section 5 is drawn from Shriya's own messages and decisions. Edit freely; the body is about 610 words.

## 1. What I built

In group tutoring, most wrong answers share a few root causes, but the tutor sees them one desk at a time. **TutorPulse** is a live room for group tutoring. Students join from a phone with a code or QR, write their working on a sketch pad and type a final answer. Answers are checked exactly, and the wrong ones are grouped by AI into named misconceptions ("Forgot the inner derivative · 3") on the tutor's board while the session runs. The tutor takes a group to the board, students revise, and the count falls. Afterwards students get a practice set aimed at the room's real mistakes.

- Live: **https://tutorpulse.app.space** · 2-minute demo video: `docs/demo/tutorpulse-demo.mp4`
- Test accounts: `tutor-1@deepspace.test` (tutor) and seven students (Maya, Jordan, Priya, Leo, Sam, A, B). Passwords shared privately.

## 2. DeepSpace primitives used

- **AI via the DeepSpace proxy:** Claude Haiku groups wrong answers, reading the typed answer and the student's handwritten working image; output is validated, with a fallback.
- **AI chat with custom tools:** a Socratic hint assistant that can read the current problem and search the notes, scoped to the student's session.
- **Anthropic sandbox:** a background job writes the practice-set PDF and chart in Python.
- **Managed knowledge:** the tutor's notes are indexed per session and ground the hints.
- **Platform:** auth, row-level permissions, real-time sync, server actions, presence (live roster), background jobs, private file storage for working images, local agent tools, the multi-user test fixture and deploy.

## 3. Main tradeoff

**AI explains wrong answers; it never grades them.** Correctness is a deterministic maths check (mathjs at 5 points), so the counts are exact, instant and free, and only wrong answers cost an AI call. It's also why the whiteboard doesn't replace the typed answer: grading handwriting would make the counts fuzzy. The cost is that only expression answers in *x* are auto-checked; anything else is marked "needs review".

## 4. Where the agent helped

- Diagnosed the failed install, found the scaffold pinned to a stale SDK, and re-scaffolded on 0.44.2.
- Checked SDK calls against the installed types and proved risky paths with throwaway spikes first.
- Built the schemas, guards, actions, jobs, prompts, UI and tests (131 unit tests, 14 browser specs including privacy tests).
- Found security gaps beyond the spec: any member could enqueue or read jobs, presence rooms admitted strangers, and the SDK's chat collections had no signed-out deny.
- Built clustering evals scored against intended groups: 0.95 → 1.00 after prompt tuning; 1.00 on real PLTL Week 4 problems; 0.92 without working images vs 1.00 with them.
- Recorded the demo and kept the agent log.

## 5. What I verified, decided and changed

- **Set the rules:** wrote the requirements and build prompt, including the security rules and the dependency list.
- **Made the calls:** re-scaffold on the new SDK, owner-billed hints, building F17, and more accounts for a realistic room.
- **Tested it myself:** signed off Phase 0, joined a live session as a student, and ran `sessionReport` against the live app.
- **Changed the direction:** judged that the demo depends on clustering feeling smart and pushed the work there; asked for the restyle and for em dashes to go because they read as AI-written.
- **Brought the domain knowledge:** eight MATH 2413 PLTL packets (one worked by me) and my common-misconceptions write-up, which became the per-week library that shapes the cluster labels.
- **Had the whiteboard idea:** group students by their written working rather than a one-line reason. I then dropped the redundant explanation box.

**Next:** test the whiteboard with real handwriting; session history; non-*x* answers.
