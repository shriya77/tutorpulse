# TutorPulse — Requirements Document

Nov 21, 2026 · Shriya Kalyan

> **Read this as the plan, not the result.** It was written before the build. The core loop shipped as planned, and once it was solid the scope grew past it: some things listed below as non-goals or "next steps" were built after all, among them reading handwritten and photographed working, history across sessions, recap and weekly digest emails, and follow-up checks. [README.md](../README.md) describes what TutorPulse does now, and [AGENT_LOG.md](AGENT_LOG.md) records each change and why.

## Overview

TutorPulse is a live room for group tutoring. It shows the tutor *why* students are getting a problem wrong, grouped by misconception, while the session is still running.

**The problem.** A tutor working with 5–20 students can see who got a problem wrong. They usually can't see that most wrong answers share one root cause. The tutor ends up walking desk to desk repeating the same explanation, or learns about the gap only after grading.

**The example.** A Calculus I group works on d/dx sin(3x²). Twelve students submit answers. Seven write cos(3x²) because they dropped the inner derivative. Two write 6x·cos(x²) because they differentiated the wrong part. Three are correct. TutorPulse shows the tutor two named clusters within seconds: "Dropped the inner derivative (7)" and "Differentiated inside the wrong function (2)." One three-minute board explanation fixes most of the room.

**Who it's for.**

- Peer tutors and study-group leaders (for example, university peer-led sessions, writing centers, math labs)
- Private tutors running small group sessions, in person or online
- TAs running recitations or office hours

**Headline feature: Misconception Radar.** Wrong answers are grouped live into named misconceptions on the tutor's board. Everything else in the app supports that one moment: joining a session, submitting work, and getting a targeted practice set afterward.

## Goals, non-goals, and success criteria

Ship by Tuesday, Nov 24, 11:59 PM ET: a deployed app where a tutor and several students can run a real session end to end and the tutor sees misconception clusters update live.

**Goals**

1. A tutor can run a full live session: create, share a join code, post problems, see submissions arrive, close the session.
2. Students join in under 30 seconds and submit answers from a phone or laptop.
3. Wrong answers are grouped into named misconceptions on the tutor's board, updating as submissions arrive.
4. After the session, the tutor gets a practice set targeting the top misconceptions, as a downloadable PDF.
5. The build uses DeepSpace's own primitives (data sync, permissions, presence, AI, storage) instead of hand-rolled versions.

**Non-goals (deliberately left out)**

- Video or audio calls. Most group tutoring is in a room or already on Zoom; adding LiveKit would add cost and failure points without improving the core moment.
- Payments. Group tutors at a university don't charge per session, and nothing in the core flow needs billing.
- Grades, gradebooks, or LMS sync. TutorPulse is formative (during learning), not an assessment tool.
- Handwriting or photo recognition of work. Typed answers plus a one-line explanation are enough for clustering and much more reliable in four days. *(Later built anyway, as an optional sketch pad and photo of paper alongside the typed answer; see the README's whiteboard section.)*
- Long-term student analytics across many sessions (listed as a next step). *(Later built: the History page and the weekly digest.)*

**Success criteria for the submission**

| Criterion (from DeepSpace's rubric) | How TutorPulse meets it |
| --- | --- |
| Sensible scope for the window | One core loop (submit → cluster → act), with features cut in a fixed order (see Build schedule) |
| Deployed result works on the important path | Live URL demo: tutor + 2 students in separate browsers, clusters appear within \~10 s |
| Technical depth via working flows | Real-time multi-user state, role-based permissions, AI tools over records, sandbox-generated PDF |
| Integrations explained, including ones left out | SDK coverage map section + non-goals above |
| Understandable code, protected secrets, platform primitives | No API keys in repo; built-in RBAC, presence, storage, and AI chat used, not reimplemented |
| Writeup: tradeoff, agent's role, what was verified | Agent log kept daily; template in the Writeup section |

## Users, roles, and permissions

Two roles per session (tutor and student), enforced on the server by DeepSpace's per-collection permissions, never by hiding things in the UI.

DeepSpace roles (`viewer`, `member`, `admin`) are app-wide, and the docs say plainly that "client-side filtering is not a security boundary" ([permissions](https://docs.deep.space/concepts/permissions)). So "tutor of this session" is modeled as row-level access: every session-scoped record carries the tutor's user ID in a `collaboratorsField`, and students own their own rows through `ownerField`.

| Capability | Tutor | Student | Anonymous visitor |
| --- | --- | --- | --- |
| Create a session, add problems | Yes | No (can also be a tutor of their own sessions) | No |
| See the answer key | Yes (own sessions) | Never | Never |
| Join with a code | n/a | Yes, after sign-in | No (sign-in required) |
| Submit an answer + explanation | No | Yes, own rows only | No |
| See all submissions in the session | Yes | Only their own | No |
| See misconception clusters | Yes | Only the cluster topic currently "on the board" | No |
| Ask the AI hint assistant | Yes | Yes, but it can only read problems, never other students' work | No |
| Change focus / close session | Yes | No | No |
| Download practice-set PDF | Yes | Yes, once the tutor publishes it | No |

**Key rules**

- Students never see other students' answers or the answer key. The answer key lives in its own collection that only the tutor can read, because DeepSpace has no general field-hiding on reads.
- Submissions are created only through a server action, which checks the join code and session state, then stamps `studentId` and the tutor's ID. Students can't forge who can read their work.
- The AI assistant runs with the caller's role, so a student's assistant physically cannot read other students' submissions, per the [AI chat guide](https://docs.deep.space/guides/ai-chat).

## User flows

One session runs through five flows; the Calculus I example below is the one to use in the demo video and the live interview.

**Flow A — Tutor sets up (before the session, \~3 min)**

1. Tutor signs in and clicks **New session**. Enters a title: "Calc I — Chain Rule Review."
2. Adds problems one at a time. Each has a prompt (text, with LaTeX like `\frac{d}{dx}\sin(3x^2)`), the correct answer, and an optional note on common mistakes the tutor already expects.
3. Optionally uploads a worksheet or notes PDF. It is indexed so the AI hint assistant can ground its hints in the tutor's own material.
4. Clicks **Open session**. Gets a 6-character join code (for example `K7Q2MX`) and a QR code to show on the projector.

**Flow B — Students join (\~30 s)**

1. Student scans the QR code or enters the code at `tutorpulse.app.space`.
2. Signs in (DeepSpace auth). Lands on the current problem.
3. The tutor's roster updates live: names appear with a green dot, plus "on Problem 2" or "submitted."

**Flow C — Students work and submit**

1. Student types a final answer and a one-line "how I got it" (for example, "derivative of sin is cos so cos(3x²)").
2. Optional: taps **I'm stuck** to flag the tutor, or **Hint** to ask the AI assistant. The assistant gives a nudge, never the answer.
3. Student sees "Submitted ✓" and can revise until the tutor locks the problem.

**Flow D — Tutor watches the Misconception Radar (the core moment)**

1. The tutor's board shows, per problem: submitted count, correct count, and a list of misconception clusters with counts.
2. As wrong answers arrive, the app re-clusters in the background. For d/dx sin(3x²) the board reads: "Dropped the inner derivative — 7" and "Differentiated the inside function only — 2."
3. Tutor taps a cluster to see the anonymized answers behind it, then taps **Take to board**. Every student's screen shows a banner: "Discussing: the chain rule's inner derivative."
4. Tutor explains, then taps **Re-open** so students can revise. Revised answers update the clusters live, and the tutor sees the "Dropped the inner derivative" count fall.

**Flow E — Wrap-up (\~1 min)**

1. Tutor clicks **End session**.
2. The app generates a practice set: 2–3 new problems per top misconception plus a chart of correct-rate per problem, rendered as a PDF in the sandbox.
3. Tutor reviews and clicks **Share with students**. Students see a download link on their end screen.

One-line version for the writeup: *students submit → AI groups the wrong answers by why → tutor teaches to the biggest group → students revise → everyone leaves with targeted practice.*

## Functional requirements

P0 items are the demo path and must work on the live URL; P1 items make it impressive; P2 items are stretch goals and go into the writeup as "what I'd do next" if not built.

| ID | Requirement | Priority | Built with |
| --- | --- | --- | --- |
| F1 | Sign in / sign out | P0 | DeepSpace auth |
| F2 | Tutor creates a session with a title; gets a 6-character join code | P0 | `sessions` collection, `openSession` server action |
| F3 | Tutor adds, edits, and reorders problems (prompt with LaTeX, correct answer, optional expected-mistake note) | P0 | `problems` + `answerKeys` collections |
| F4 | Student joins by code; join is rejected if the session is closed or the code is wrong | P0 | `joinSession` server action |
| F5 | Student sees the current problem, rendered with KaTeX | P0 | `useQuery('problems')` |
| F6 | Student submits a final answer + one-line explanation; can revise until the problem is locked | P0 | `submitAnswer` server action → `submissions` |
| F7 | Correctness is checked automatically by numeric equivalence (so `6x cos(3x^2)` = `cos(3x²)·6x`) | P0 | mathjs inside the server action |
| F8 | Tutor board shows per-problem submitted / correct counts, updating live | P0 | Real-time sync via `useQuery` |
| F9 | Wrong answers are grouped into named misconception clusters with counts; re-clustered as new answers arrive | P0 | Background job + AI generation → `clusters` |
| F10 | Live roster: who is online, which problem they're on, who has submitted, who pressed "I'm stuck" | P1 | `usePresenceRoom('session:<id>')` |
| F11 | Tutor taps a cluster → sees the anonymized answers inside it | P1 | `clusters.submissionIds` + `submissions` read by tutor |
| F12 | "Take to board": tutor pushes a topic banner to every student; "Re-open" unlocks revisions | P1 | `sessions.focus` field, synced live |
| F13 | AI hint assistant for students: nudges toward the method, never gives the final answer; grounded in the tutor's uploaded notes | P1 | AI chat + custom read-only tools + managed knowledge |
| F14 | Tutor uploads a worksheet/notes PDF; it is stored and indexed | P1 | `useR2Files` + knowledge binding (`kb.add`) |
| F15 | End session → practice-set PDF (2–3 new problems per top misconception + correct-rate chart) | P1 | Anthropic sandbox (Python) in a background job → `appFiles` |
| F16 | Tutor publishes the practice set; students get a download link | P1 | `practiceSets` collection + file URL |
| F17 | Tutor's local coding agent can pull a session report (`npx deepspace agent invoke tutorpulse sessionReport`) | P2 | Local agent tools, same tool set as F13 |
| F18 | Session history page: past sessions with their top misconceptions | P2 | `useQuery('sessions')` |
| F19 | Email the practice set to students | P2 | `email/send` integration |

**Rules of the core loop**

- A submission is "correct" if it matches the answer key numerically at 5 random points within 1e-6 tolerance. Only incorrect submissions are sent to the AI, which keeps cost low and keeps the AI out of grading.
- Clustering is debounced: at most one clustering job per problem in flight. A new submission marks the problem "dirty," and the job re-runs once when it finishes.
- Cluster labels are short (≤ 6 words), written in the tutor's language, and every wrong submission is assigned to exactly one cluster or to "Other."

## Data model

Seven collections in the app's main room. Anything private carries row-level rules, and the two most sensitive collections can only be written by server actions.

Records follow DeepSpace's envelope (`recordId`, `data`, `createdBy`, `createdAt`, `updatedAt`), so fields below live under `record.data` ([data model](https://docs.deep.space/concepts/data-model)). Schemas compile at deploy time, so finalize them on Day 1.

| Collection | Key fields | `member` permissions | Written by |
| --- | --- | --- | --- |
| `users` | built-in | built-in | platform |
| `sessions` | `title`, `joinCode`, `status` (draft / open / closed), `currentProblemId`, `focusLabel`, `participantIds` (collaboratorsField) | read `'collaborator'`, create `true`, update `'own'`, delete `'own'` | tutor (client); `joinSession` adds students to `participantIds` |
| `problems` | `sessionId`, `order`, `prompt` (LaTeX), `status` (open / locked) | read `true`, create `true`, update `'own'`, delete `'own'` | tutor (client) |
| `answerKeys` | `problemId`, `answer`, `expectedMistakes` | read `'own'`, create `true`, update `'own'`, delete `'own'` | tutor (client) |
| `submissions` | `sessionId`, `problemId`, `studentId` (ownerField, userBound), `tutorIds` (collaboratorsField), `answer`, `explanation`, `isCorrect`, `revision`; `uniqueOn: [problemId, studentId]` | read `'collaborator'`, create `false`, update `false`, delete `false` | `submitAnswer` server action only |
| `clusters` | `sessionId`, `problemId`, `label`, `explanation`, `count`, `submissionIds`, `tutorIds` (collaboratorsField) | read `'collaborator'`, create/update/delete `false` | clustering background job only |
| `practiceSets` | `sessionId`, `fileKey`, `fileUrl`, `status` (generating / ready / published), `participantIds` (collaboratorsField) | read `'collaborator'`, create `false`, update `'own'` | practice-set job; tutor flips `status` to published |

In every collection, `'*'` (signed-out visitors) gets `read: false`, and `admin` gets full access for debugging.

**Why it's shaped this way**

- **Answer key split out.** DeepSpace has no general way to hide one field on read, so the correct answer can't sit on `problems`, which every member can read.
- **Submissions are server-written.** If students created their own rows, they could set `tutorIds` to anyone, including a classmate. Routing writes through `submitAnswer` lets the server stamp the owner and readers. Server actions bypass RBAC, so the action itself must check that the caller is in `participantIds` and that the problem is open.
- **Problems are readable app-wide (a tradeoff).** Prompts aren't sensitive, and this avoids copying the participant list onto every problem. If a tutor wanted private problem banks, the next step is a per-session `RecordScope` room.
- **"I'm stuck" and "on Problem 2" are presence, not records.** They're ephemeral and shouldn't fill the database.

Example schema (submissions), following the pattern in the docs:

```ts
export const submissionsSchema: CollectionSchema = {
  name: 'submissions',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain' },
    { name: 'problemId', storage: 'text', interpretation: 'plain' },
    { name: 'studentId', storage: 'text', interpretation: 'plain', userBound: true },
    { name: 'tutorIds', storage: 'text', interpretation: 'plain' }, // JSON array
    { name: 'answer', storage: 'text', interpretation: 'plain' },
    { name: 'explanation', storage: 'text', interpretation: 'plain' },
    { name: 'isCorrect', storage: 'number', interpretation: 'plain' },
    { name: 'revision', storage: 'number', interpretation: 'plain' },
  ],
  ownerField: 'studentId',
  collaboratorsField: 'tutorIds',
  uniqueOn: ['problemId', 'studentId'],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    member: { read: 'collaborator', create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
```

Verify the exact property names for `ownerField`, `collaboratorsField`, `userBound`, and `uniqueOn` against the [schemas reference](https://docs.deep.space/sdk-reference/worker/schemas) on Day 1; the [permissions page](https://docs.deep.space/concepts/permissions) names them, but this snippet's placement is my best reading.

## Architecture and how each feature is built

Browsers read and write ordinary data straight through DeepSpace's live sync. Anything that needs trust or AI (submissions, clustering, hints, the PDF) goes through the worker.

&#91;embedded content: TutorPulse architecture · 3 clients, worker, platform services\]

Dashed lines are direct WebSocket subscriptions (both browsers); solid arrows are the main call paths. The clustering job (highlighted) is the heart of the app.

**Stack:** the DeepSpace scaffold (`npx deepspace`): React + Vite frontend, Cloudflare Worker backend, plus KaTeX for math rendering and mathjs for answer checking.

**1. Submitting an answer (F6, F7)**

1. Client calls `POST /api/actions/submitAnswer` with `{ problemId, answer, explanation }` and the user's token.
2. The action reads `ctx.userId`, loads the problem and session, and rejects if the caller isn't in `participantIds` or the problem is locked. This check is required because actions bypass RBAC.
3. It loads the answer key and checks equivalence with mathjs: evaluate both expressions at 5 random x values and compare within 1e-6.
4. It upserts the `submissions` row (`studentId`, `tutorIds`, `isCorrect`, `revision + 1`).
5. If the answer is wrong, it marks the problem's `clusterState` dirty and enqueues `cluster-problem` unless one is already running.
6. The tutor's board updates on its own, because the room broadcasts the new row to every client allowed to read it.

**2. Misconception clustering (F9), a background job**

1. The `cluster-problem` job loads the problem, the answer key, the tutor's expected-mistake note, the current cluster labels, and all wrong submissions (`id`, `answer`, `explanation`).
2. It calls Claude through `createDeepSpaceAI(env, 'anthropic')` + `generateText`, asking for JSON: `{ clusters: [{ label, explanation, submissionIds }] }`. A fast model (Sonnet or Haiku 5.5) keeps it to a few seconds.
3. It validates the result with Zod: every wrong submission appears in exactly one cluster or in "Other." If validation fails, it retries once and then falls back to grouping identical answers.
4. Existing labels go into the prompt, so labels stay stable instead of being renamed on every run.
5. It replaces that problem's `clusters` rows. If more submissions arrived during the run, it chains one more run with `this.enqueue`.

**3. AI hint assistant (F13)**

- Uses the bundled `ChatPanel` and `POST /api/ai/chat`.
- The write tools are removed from `ALLOWED_TOOL_NAMES`, making the assistant read-only.
- Two custom tools in `src/ai/tools.ts`: `getCurrentProblem(sessionId)` and `searchNotes(query)`. The second calls `knowledge(env).scoped({ folder: sessionId }).search(query, { mode: 'hybrid', limit: 5 })`.
- The system prompt is Socratic: name the relevant rule, ask a guiding question, never state the final answer.
- Defense in depth: because the assistant runs with the student's role, it can't read `answerKeys` or other students' `submissions` even if prompted to.

**4. Tutor notes upload (F14)**

- The tutor uploads with `useR2Files().upload(file)`.
- A server action adds the file to the knowledge binding under the folder `<sessionId>` and records a sidecar row, since R2 metadata has no MIME type.
- The UI shows "Indexing…" until `kb.list` reports `completed`.

**5. Practice set (F15, F16), a background job using the sandbox**

1. `practice-set` builds a summary JSON: problems, correct rates, top clusters, and their example wrong answers, with no student names.
2. It uploads the summary with `sandboxFiles` and runs Claude via `streamText` with the `code_execution` tool.
3. Claude writes 2–3 new problems per top misconception (answers on the last page), draws a matplotlib chart of correct-rate per problem, and renders a PDF to `$OUTPUT_DIR`.
4. The job downloads the PDF, saves it with `appFiles`, creates the `practiceSets` row, and deletes the sandbox files.
5. It reports progress live ("Writing problems… Rendering PDF…") through `ctx.progress`.

**6. Live roster and "Take to board" (F10, F12)**

- Every client joins `usePresenceRoom('session:<id>')` and calls `updateState({ problemId, submitted, stuck })`. The state is re-sent after a reconnect, because a reconnect clears it.
- "Take to board" writes `sessions.focusLabel`. Students see the banner through their live `useQuery` on the session.

**7. Local agent access (F17, stretch)**

- The `sessionReport` tool lives in `src/ai/tools.ts`, so the website assistant and `npx deepspace agent invoke` share it.
- Its `authorize` callback allows only the session's tutor.

## DeepSpace SDK coverage map

TutorPulse uses 12 DeepSpace platform features and 4 integrations (AI chat with tools, AI generation through the proxy, the Anthropic sandbox, managed knowledge). Each one carries a specific part of the core loop, and 6 others are left out with reasons. This clears the task's "at least three integrations" bar without padding.

**Used**

| DeepSpace feature | What it does in TutorPulse | Where | Why this instead of hand-rolling |
| --- | --- | --- | --- |
| Auth (sign-in, JWT) | Identifies tutors and students; every server action reads `ctx.userId` | Scaffold + `src/actions` | Verified identity is what the row-level permissions key off |
| Collections + `useQuery` / `useMutations` | Sessions, problems, answer keys, submissions, clusters, practice sets | `src/schemas/*`, React pages | Typed SQLite tables with no backend code to write |
| Real-time sync (RecordRoom) | Tutor board, cluster list, and focus banner update live with no polling | Every `useQuery` | The room broadcasts each change only to clients allowed to read it, so live updates and privacy come from one mechanism |
| Row-level permissions (`'own'`, `'collaborator'`, `ownerField`, `collaboratorsField`, `userBound`, `uniqueOn`) | Students see only their own work; only the tutor sees all submissions, clusters, and the answer key | Schemas | Enforced in the Durable Object, the real security boundary |
| Server actions | `joinSession`, `submitAnswer`, `openSession`, `publishPracticeSet` | `src/actions/index.ts` | Trusted place to validate joins, check correctness, and stamp who may read a row |
| Presence (`usePresenceRoom`) | Live roster: online, which problem, submitted, "I'm stuck" | Session pages | Ephemeral state that shouldn't become database rows |
| Background jobs (`useJobs`, `enqueueJob`, `ctx.progress`) | Clustering and practice-set generation | `src/jobs.ts` | Outlive the request, report live progress, retry safely, replacing fragile `waitUntil` |
| File storage (`useR2Files`, `appFiles`) | Tutor notes uploads; generated practice-set PDFs | Upload UI, practice-set job | No storage credentials in the app; the platform handles them |
| Secrets (`npx deepspace secrets`) | Only for any optional third-party key; none needed for the core | CLI | `.dev.vars` is generated and git-ignored, so no keys in the repo |
| **Integration: AI chat + custom tools** | Student hint assistant (read-only) and the tutor's `sessionReport` | `/api/ai/chat`, `src/ai/tools.ts` | Streaming, history, and role-scoped tool use come built in, and the assistant can't exceed the user's role |
| **Integration: AI generation via the DeepSpace proxy** | Misconception clustering (`createDeepSpaceAI` + `generateText`) | `cluster-problem` job | No provider API key to manage, and billing is routed by the platform |
| **Integration: Anthropic sandbox** | Python that writes the practice-set PDF and chart | `practice-set` job | Real code execution with no infrastructure and no Anthropic key |
| **Integration: Managed knowledge** | Hints grounded in the tutor's own worksheet or notes | `searchNotes` tool | Managed retrieval with per-session folders (`kb.scoped`), no vector database to run |
| Multi-user testing (`users` fixture) | Tutor + 2 students in one Playwright test | `tests/session.spec.ts` | Proves the multi-user path works, not just that the page loads |
| Deploy (`npx deepspace deploy`) | Live at `tutorpulse.app.space` | CLI | One-command deploys |
| Local agent tools (stretch) | `npx deepspace agent invoke tutorpulse sessionReport` | `src/ai/tools.ts` | Same tool set as the in-app assistant, with one permission model |

**Deliberately left out**

| Not used | Why it wouldn't make the product better |
| --- | --- |
| LiveKit audio/video rooms | Group tutoring is usually in person or already on Zoom or Teams. Video adds per-minute cost and a big failure surface without improving the core moment, which is seeing *why* answers are wrong. |
| Payments (Stripe Checkout) | Peer and university tutoring is free, and nothing in a session needs billing. A paid "Pro" tier would be speculative padding. |
| Collaborative text (Yjs) | Students submit individually by design. A shared editor would mix one student's thinking into another's and break the clustering. |
| Messaging channels | The tutor is in the room. "I'm stuck" as presence state is lighter and never leaves stale messages behind. |
| Google OAuth / Gmail / Calendar | Built-in sign-in is enough. Calendar sync is out of scope for a live tool. |
| Scheduled (cron) jobs | Nothing recurs. A "weekly misconception digest" is a reasonable next step once session history exists. |
| Mobile app publishing | The student view is responsive web and opens from a QR code, so an app-store build adds nothing for a four-day demo. |

## Non-functional requirements

The app must be safe to hand to real students, cheap enough to run on the free plan, and fast enough that clusters feel live.

| Area | Requirement | How it's met |
| --- | --- | --- |
| Privacy | A student can never read another student's answers, the answer key, or the clusters | Row-level permissions in the Durable Object; submissions and clusters writable only by server code; verified by a Playwright test (T4) |
| Server trust | Every server action re-checks the caller, because actions bypass RBAC | Shared `requireParticipant(ctx, sessionId)` / `requireTutor(...)` helpers used by every action; raw `users` rows never returned |
| Secrets | No keys in the repo or logs | Core needs no provider keys (DeepSpace AI proxy + sandbox). Any optional key via `npx deepspace secrets set`; `.dev.vars` git-ignored; `callerJwt` never logged |
| AI cost | Bounded spend on the developer-billed path | Only wrong answers go to the AI; one clustering job per problem in flight; a per-session cap (e.g. 30 clustering runs, 5 practice sets) stored on the session and checked in the action; fast model for clustering |
| Storage | Stay under the 128 MiB free-plan quota | Notes PDFs capped at 10 MB each; practice PDFs are small; sandbox files deleted after use |
| Latency | Submission visible on the tutor board in under 1 s; clusters updated within \~10 s of a wrong answer | Live sync for submissions; a short clustering prompt on a fast model |
| Resilience | A failed AI call never breaks the session | Correct/incorrect counts don't depend on AI; clusters fall back to "identical answers" grouping; job retries with `maxAttempts: 2` |
| Accessibility | Usable on a phone and with a keyboard or screen reader | Responsive layout; KaTeX MathML output; buttons with labels; counts shown as numbers, not color alone |
| Answer checking | No false "correct" on equivalent-looking but wrong answers | Numeric check at 5 random points; non-parsable input is treated as "needs review" and sent to clustering with the raw text |
| Code quality | A reviewer can follow it in 10 minutes | One folder per concern (`schemas/`, `actions/`, `jobs.ts`, `ai/tools.ts`, `pages/`); README with architecture and run steps |

## Testing and verification plan

The headline test is a three-user Playwright run (one tutor and two students) using DeepSpace's `users` fixture. It proves the multi-user path, privacy, and live updates in one go.

**Setup:** create 3 test accounts with `npx deepspace test accounts create --email …@deepspace.test` (the pool is capped at 10 per machine); run with `npx deepspace test run e2e` ([testing guide](https://docs.deep.space/guides/testing)).

| ID | Test | Type | Passes when |
| --- | --- | --- | --- |
| T1 | Tutor creates session + 2 problems, opens it | E2E | Join code shown; problems listed |
| T2 | Two students join by code; a wrong code is rejected | E2E (`users(3)`) | Both names appear on the tutor roster; bad code shows an error |
| T3 | Student A submits a correct answer, Student B a wrong one | E2E | Tutor board shows 2 submitted / 1 correct without a reload |
| T4 | Privacy: Student A queries `submissions`, `answerKeys`, `clusters` | E2E | Student A sees only their own submission; the other two are empty |
| T5 | Server action rejects a forged submission (non-participant, locked problem) | API | `success: false` with a clear error |
| T6 | Answer equivalence | Unit | `6x*cos(3x^2)` ≡ `cos(3x^2)*6x`; `cos(3x^2)` ≠ key |
| T7 | Cluster output validation | Unit | Bad AI JSON (missing or duplicated IDs) is caught and falls back |
| T8 | Clustering end to end | E2E on the deployed app, manual | 6 seeded wrong answers produce 2–3 sensible clusters within \~10 s |
| T9 | Hint assistant refuses to give the answer and can't read the key | Manual, scripted prompts | "Just tell me the answer" gets a nudge; asking for the answer key gets a refusal |
| T10 | Practice-set PDF | Manual on the deployed app | PDF downloads, has new problems for the top cluster plus a chart |

**Verification I do myself (for the writeup)**

- [ ] Read every schema and permission block line by line; T4 passes
- [ ] Read every server action for the participant/tutor check
- [ ] Run T8 on the live URL with three real browsers (or phone + laptop)
- [ ] Grep the repo and history for keys/tokens before submitting
- [ ] Read the clustering prompt and 3 real outputs; tune the labels by hand
- [ ] Record a 2-minute screen capture of the core loop as a backup demo

## Build schedule (Nov 21–24)

The P0 loop is deployed by Sunday night; Monday adds the integrations; Tuesday is fixes and the writeup. Submit by 8 PM ET Tuesday, leaving four hours of buffer before the 11:59 PM ET deadline.

**Saturday, Nov 21 — De-risk (evening)**

- [ ] `npx deepspace` scaffold, `npx deepspace deploy` a hello-world to `tutorpulse.app.space` (uploads only work after the first deploy)
- [ ] Read the deepspace-skill repo and one example (storynest or taskspace); install the skill in the coding agent
- [ ] Spike 1: one `generateText` call through `createDeepSpaceAI` from a server action
- [ ] Spike 2: a minimal sandbox call that writes a PDF to `$OUTPUT_DIR` (confirm the scaffolded SDK supports it)
- [ ] Write all 7 schemas with permissions (they're baked in at deploy)
- [ ] Start the agent log

**Sunday, Nov 22 — Core loop (P0: F1–F9)**

- [ ] Tutor: create session, add problems + answer keys, open with join code
- [ ] `joinSession` and `submitAnswer` actions with participant checks + mathjs equivalence
- [ ] Student view: KaTeX problem, submit/revise
- [ ] Tutor board: live counts per problem
- [ ] `cluster-problem` job + clusters on the board
- [ ] Deploy; run the loop with 2 browsers
- [ ] **Cut line 1:** if clustering isn't working by Sunday night, ship "group identical answers" and move AI clustering to Monday morning

**Monday, Nov 23 — Depth (P1: F10–F16)**

- [ ] Presence roster + "I'm stuck"
- [ ] Cluster drill-in, "Take to board," re-open
- [ ] Notes upload + knowledge indexing + hint assistant with read-only tools
- [ ] `practice-set` job with sandbox → PDF → publish to students
- [ ] Playwright T1–T5 passing
- [ ] **Cut line 2:** if the sandbox misbehaves, ship the practice set as an on-page list generated by `generateText`, and explain the tradeoff in the writeup

**Tuesday, Nov 24 — Polish and submit**

- [ ] Fix bugs from a full run on phone + laptop; empty and error states
- [ ] README (architecture diagram, run steps, test steps)
- [ ] Secret scan of the repo and history
- [ ] Writeup (template below); final deploy
- [ ] Submit the live URL, repo, and writeup in the portal by 8 PM ET
- [ ] Stretch only if everything above is done: F17 local agent `sessionReport`

**If time runs short, cut in this order:** F17 local agent → F14 notes upload + knowledge (the hint assistant still works from the problem alone) → F15 sandbox PDF (fallback above) → F10 presence. Never cut F6–F9.

## Writeup outline and agent log

The portal asks for five things, so the writeup has exactly five short sections (about 400–600 words total). Fill the agent log as you go; it becomes sections 4 and 5.

**Writeup template**

1. **What I built.** Two sentences on the problem, one on TutorPulse, then the core-loop line. Link the live URL with a demo session code and the test accounts to use.
2. **DeepSpace integrations used.** The "Used" rows from the coverage map, condensed to one line each, plus one paragraph on what was deliberately left out (LiveKit, payments, Yjs) and why.
3. **Main tradeoff.** Suggested: *"I used AI only to explain wrong answers, never to grade them."* Correctness is a deterministic numeric check, so the counts are trustworthy and cheap. The AI does what code can't: name the misconception. The cost is that only expression answers are checked automatically; free-text answers go straight to clustering.
4. **What the agent did.** Scaffolding, schema boilerplate, UI components, first drafts of the jobs and prompts. Be specific ("generated the 7 schema files from my table").
5. **What I verified or changed myself.** Permission rules and the T4 privacy test, participant checks in every server action, the clustering prompt and validation, plus any bug you caught that the agent introduced. Include one honest "unfinished / next" list.

**Agent log (one row per meaningful change)**

| Date | What I asked the agent | What it produced | What I checked / changed |
| --- | --- | --- | --- |
| Nov 21 | Example: "Generate schemas from this table with these permissions" | 7 schema files | Example: Fixed `submissions` create from `true` to `false`; added `uniqueOn` |
|  |  |  |  |
|  |  |  |  |

**Next steps to list if unfinished:** session history and per-student trends across sessions; handwriting/photo answers; a weekly misconception digest via scheduled jobs; private problem banks via per-session rooms; LMS export.

## Risks, open questions, and day-one checks

The biggest risk is the clustering quality, followed by SDK details this doc took from the docs but hasn't run yet. Both get checked on Saturday night.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Clusters are vague or unstable (labels change every run) | Medium | High | Pass the existing labels into the prompt; validate with Zod; tune on 3 seeded problems; fall back to identical-answer grouping |
| Sandbox not available in the scaffolded SDK version | Medium | Medium | Spike on Saturday; fallback is an on-page practice list (cut line 2) |
| A permission property name or placement differs from this doc | Medium | High | Check against the schemas reference on Day 1; T4 privacy test catches mistakes |
| AI or integration costs run up during testing | Low | Medium | Per-session caps; fast model; only wrong answers sent |
| mathjs can't parse some student input | Medium | Low | Treat as "needs review," send raw text to clustering |
| Running out of time | Medium | High | Fixed cut order; P0 deployed Sunday; submit 4 h early |

**Open questions to answer on Day 1**

- [ ] Exact schema properties for `ownerField`, `collaboratorsField`, `userBound`, `uniqueOn` ([schemas reference](https://docs.deep.space/sdk-reference/worker/schemas))
- [ ] Does `generateText` with the DeepSpace AI factory return clean JSON, or should it use the AI SDK's structured output?
- [ ] Can a background job read `answerKeys` and write `clusters` (RBAC bypass for server code), or does it need a server action?
- [ ] Does the knowledge binding index PDFs directly, or does text need extracting first?
- [ ] Rendering KaTeX inside the AI chat panel

## Sources

- [DeepSpace docs home](https://docs.deep.space/)
- [Permissions](https://docs.deep.space/concepts/permissions) · [Data model](https://docs.deep.space/concepts/data-model)
- [Presence and cursors](https://docs.deep.space/guides/presence-and-cursors) · [Server actions](https://docs.deep.space/guides/server-actions) · [Background jobs](https://docs.deep.space/guides/background-jobs)
- [AI chat](https://docs.deep.space/guides/ai-chat) · [Worker AI reference](https://docs.deep.space/sdk-reference/worker/ai) · [Anthropic sandbox](https://docs.deep.space/guides/anthropic-sandbox)
- [Managed knowledge](https://docs.deep.space/bindings/knowledge) · [File uploads](https://docs.deep.space/guides/file-uploads) · [Secrets](https://docs.deep.space/guides/secrets)
- [Testing](https://docs.deep.space/guides/testing) · [Local agent tools](https://docs.deep.space/guides/local-agent-tools) · [LiveKit](https://docs.deep.space/guides/livekit)
- [DeepSpace examples on GitHub](https://github.com/deepdotspace)
