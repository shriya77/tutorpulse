# TutorPulse — writeup (draft)

> Draft written by the coding agent from `docs/AGENT_LOG.md`. Sections 1–4 are for you to edit. **Section 5 is yours**; it's left as placeholders on purpose. Target is about 400–600 words in total.

## 1. What I built

A tutor working with 5–20 students can see *who* got a problem wrong, but not that most wrong answers share one root cause, so they repeat the same explanation desk to desk. **TutorPulse** is a live room for group tutoring. Students join from a phone with a code or QR, answers are checked exactly, and the wrong ones are grouped by AI into named misconceptions on the tutor's board while the session is still running.

*Students submit → AI groups the wrong answers by why → tutor teaches to the biggest group → students revise → everyone leaves with targeted practice.*

- Live: **https://tutorpulse.app.space** (demo session: "Calc I — Chain Rule Review"; click *Open session* to get a join code)
- Test accounts: `tutor-1@deepspace.test`, `student-a-00ef20@deepspace.test`, `student-b-00ef20@deepspace.test` *(share passwords privately, not in the writeup)*

## 2. DeepSpace integrations used

- **AI generation via the DeepSpace proxy:** Claude Haiku clusters wrong answers (structured output, zod-validated, retry, then fallback).
- **AI chat + custom tools:** a read-only Socratic hint assistant (`ChatPanel`, `get_current_problem`, `search_notes`), scoped server-side to the student's live session.
- **Anthropic sandbox:** a background job has Claude write the practice-set PDF and correct-rate chart in Python.
- **Managed knowledge:** the tutor's notes (PDF or text) are indexed per session and ground the hints.
- **Local agent tools (F17 stretch):** `npx deepspace agent invoke tutorpulse sessionReport` gives a tutor's own coding agent a per-session report. It's tutor-only and contains counts and labels only.
- **Platform primitives:** auth; collections with row-level permissions (`collaborator`, `ownerField`, `collaboratorsField`, `uniqueOn`, `writableFields`); real-time sync; server actions; presence (live roster, "I'm stuck"); background jobs; app file storage; the multi-user Playwright fixture; one-command deploy.

**Left out on purpose:** LiveKit video (tutoring is in the room or on Zoom already, and video adds cost without helping the core moment), payments (peer tutoring is free), and Yjs collaborative text (answers are individual by design, and a shared editor would break clustering). Messaging, Google OAuth, cron and mobile publishing were skipped for similar reasons.

## 3. Main tradeoff

**I used AI only to explain wrong answers, never to grade them.** Correctness is a deterministic numeric check (mathjs at 5 points, 1e-6 tolerance, student input parsed against an allowlist), so the counts on the board are trustworthy, instant and free. The AI does what code can't: name the misconception. The cost is that only expression answers in *x* are checked automatically. Anything else is marked "needs review" and goes to clustering as raw text. A second, smaller tradeoff: hints and AI jobs are billed to the app owner with per-session caps, because students may have no credits of their own.

## 4. What the agent did

- Diagnosed the failed install (an npm 10 resolver bug). It found the scaffold was pinned to a 27-versions-old SDK that lacked the sandbox and knowledge, re-scaffolded on 0.44.2, and found the app ID had never been registered.
- Answered the spec's five open SDK questions from the installed types and docs, and proved the risky paths with throwaway spikes (AI JSON, sandbox PDF) before building on them.
- Generated the 8 schemas from the spec's permission table, flagging and fixing where the spec couldn't work (`practiceSets` `update: 'own'` → server-only publish; no `userBound` on server-written rows).
- Wrote the guards, actions, both jobs, the three prompts, all UI, and the tests: 100+ unit tests including T6/T7, and Playwright T1–T5 plus a live walkthrough, phone layout and Phase 3 specs.
- Found and fixed security gaps beyond the spec: any member could enqueue or read jobs; presence rooms admitted strangers; the SDK chat schemas had no signed-out deny; an answer-revealing input placeholder.
- Kept the agent log, SDK notes, README, and this draft.

## 5. What I verified or changed myself

*(Yours to write. Prompts from the requirements doc's checklist and the log:)*

- [ ] Read every schema and permission block line by line; ran T4 — *what I saw:*
- [ ] Read every server action for the participant / tutor check — *notes:*
- [ ] Ran the core loop on the live URL with real browsers / phone + laptop — *done 2026-11-21 as a student; add the rest*
- [ ] Read the clustering prompt and 3 real outputs; tuned labels? — *notes:*
- [ ] Tried to get the hint assistant to reveal the answer / the key — *result:*
- [ ] Opened a generated practice-set PDF and checked the answers — *result:*
- [ ] Secret scan reviewed (agent's commands and results are in `docs/AGENT_LOG.md`) — *notes:*
- [ ] Bugs I caught or decisions I changed — *list:*

**Unfinished / next:** session history and per-student trends; answers in other variables, handwriting or photos; a weekly misconception digest (scheduled jobs); private problem banks via per-session rooms; LMS export.
