# SDK notes — answers to the requirements doc's open questions

Checked against the **installed SDK `deepspace@0.44.2`** (`node_modules/deepspace/dist/*.d.ts`),
`ai@7.0.107`, and the docs at <https://docs.deep.space> (fetched 2026-11-21 via `llms-full.txt`).
Where the requirements doc and the real API differ, the real API wins and the difference is listed
under [Differences from REQUIREMENTS.md](#differences-from-requirementsmd).

Status key: **Confirmed** = read in types and docs · **Spike** = proven by running code ·
**Unverified** = docs-only or untested; how it gets tested is noted.

---

## 0. SDK version (blocking finding)

The first scaffold came from a stale npx-cached CLI and pinned `deepspace ^0.17.0` (the current
release is 0.44.2). 0.17 had **no** Anthropic sandbox, knowledge binding, `registerAgent`, or JobRoom
`authorizeWrite`. It also had an `actions[name]` lookup that could resolve `constructor`. The app was
re-scaffolded on 0.44.2 (commit `Re-scaffold on DeepSpace SDK 0.44.2`).
`deepspace@0.44.2` needs **npm ≥ 11.6** (`package.json` `engines`).

The app ID that 0.17 wrote into `wrangler.toml` was minted locally and **never registered**.
`npx deepspace app init --json` refuses it with `app_not_registered`. The fix it gives is
`npx deepspace app init --new-id`.

---

## Q1. Schema properties: `ownerField`, `collaboratorsField`, `userBound`, `uniqueOn` — **Confirmed**

Refs: `node_modules/deepspace/dist/schema.d.ts` (`CollectionSchema`, `ColumnDefinition`,
`PermissionLevel`); docs `/concepts/permissions`, `/sdk-reference/worker/schemas`.

- All four are named exactly as in the doc. `ownerField`, `collaboratorsField` and `uniqueOn` sit on
  `CollectionSchema`; `userBound` sits on the column.
- `'own'` checks `record.createdBy` unless `ownerField` is set.
- `'collaborator'` means **owner OR in `collaboratorsField`**, and the owner always passes. So a
  tutor who creates a `sessions` row reads it through `'collaborator'` without being listed in
  `participantIds`.
- `userBound: true` makes the Durable Object **overwrite the column with the caller's verified user
  ID on every write**. Server code that writes on behalf of someone else (a job writing a row
  "owned" by a student) would get its own ID stamped instead. The schema-lint deliberately doesn't
  warn when every client role has `create: false`. **Decision:** no `userBound` on
  `submissions.studentId`, `clusters`, or `practiceSets`. These are server-written, and the server
  sets the ID from the verified `ctx.userId`.
- `collaboratorsField` holds a **JSON array**. Declare it with `interpretation: { kind: 'json' }`.
  Server `tools.*` / `ctx.records.*` take and return the array directly, with no `JSON.stringify`.
  (The doc's example uses `'plain'` text.)
- `uniqueOn` violations come back as `success: false` with `Duplicate: …` on the write's ack, not as
  a thrown error.
- `writableFields` (per role) limits which columns a client may supply on **create and update**.
  We'll use it so a tutor's client can't write `joinCode` or `participantIds` on `sessions`; only
  `openSession` / `joinSession` set those.
- `create` takes a boolean only. `read`, `update` and `delete` take any `PermissionLevel`.

## Q2. Does `generateText` via the DeepSpace AI factory return clean JSON, or use structured output? — **Spike: both work; use `Output.object`**

**Spike A result** (live app, 2026-11-21, `claude-haiku-5-5`, owner-billed, 4 fake wrong answers to
d/dx sin(3x²)):

| Mode | Result | Time |
| --- | --- | --- |
| `generateText({ output: Output.object({ schema }) })` | Schema-valid object, every ID present exactly once | 4.4 s |
| Plain prompt "reply with only JSON", then `JSON.parse` + zod | Clean JSON text with no code fences; parsed and validated | 2.9 s |

Structured output passes through the DeepSpace proxy. **Decision:** use `Output.object` for clustering,
because the SDK then guarantees the shape. Keep the semantic zod checks in `src/lib/clusters.ts`:
the structured run returned the label "Wrong sign: derivative of sin as negative cos" (**8 words**,
over the ≤ 6 limit). The shape was valid but the rule wasn't met, so the "retry once, then fall back"
path is needed. Labels came out sensible and close to what the doc expects ("Forgot chain rule
inner derivative" for `cos(3x^2)`).

Earlier notes:

Refs: docs `/sdk-reference/worker/ai`; `node_modules/ai/dist/index.d.ts` (`generateText({ output })`,
`Output.object({ schema })`).

- `createDeepSpaceAI(env, 'anthropic')` returns an AI SDK 7 model factory. Leaving out `authToken`
  bills the owner through `APP_OWNER_JWT`, which is what server jobs should do.
- AI SDK 7 supports `generateText({ output: Output.object({ schema }) })`. The docs don't say
  whether the DeepSpace proxy passes Anthropic structured output through. **Spike A tries both**:
  `Output.object`, and a plain "reply with only JSON" prompt parsed with zod. Results get filled in
  here.
- Either way, `src/lib/clusters.ts` still checks the meaning with zod (each wrong submission exactly
  once, labels ≤ 6 words), because a valid shape can still drop or duplicate IDs.
- Agent-capable model IDs in 0.44.2 (`listDeepSpaceAgentModels('application')`, run locally):
  `claude-opus-5-5` (default), `claude-fable-5-1`, `claude-sonnet-5-5`, `claude-haiku-5-5`,
  `gpt-6-sol`, `gpt-6-luna`. Plan: `claude-haiku-5-5` for clustering, `claude-sonnet-5-5` for the
  sandbox job.

## Q3. Can a background job read `answerKeys` and write `clusters`? — **Confirmed (docs + types)**, verified end to end in Phase 2

Refs: docs `/guides/background-jobs` ("Handlers run as the app owner"), `/guides/scheduled-jobs`
("The cron context"); `worker.d.ts` `buildCronContext`, `enqueueJob`, `JobRoomConfig`.

- Yes. Inside `runJob`, `buildCronContext(env, env.OWNER_USER_ID, \`app:${env.DEEPSPACE_APP_ID}\`)`
  returns `ctx.records` (`query` / `create` / `update` / `delete`), which **bypasses RBAC** and runs
  as the app owner. It has no `get` and no `orderBy`: fetch one row with `query({ where: { recordId } })`.
  Methods return data directly and throw on failure.
- Rows a job creates have `createdBy` = the app owner. That's why `'own'` can't mean "the tutor" on
  job-created rows (see `practiceSets` below).
- **Enqueue** from server actions with `enqueueJob(env.JOB_ROOMS, roomId, type, payload, opts)`. That
  goes to the DO's internal `/enqueue` endpoint, not the client socket.
- **Chaining a "dirty" re-run:** `this.enqueue(...)` only exists on the `AppJobRoom` class, not in
  `runJob`. Plan: `runJob` returns `{ rerun: true }` and `AppJobRoom.onJob` calls
  `this.enqueue('cluster-problem', …)`, which is the pattern the docs show.
- **Security finding:** the scaffold's `AppJobRoom.authorizeWrite` lets **any member**
  enqueue/cancel/retry any job type over the socket. `authorizeRead` defaults to the same rule, so
  every member can also see every job's payload and result. A student could start owner-billed AI
  jobs directly and skip the per-session cap. **Plan (Phase 1):** make both rules admin-only, keep
  job payloads to IDs only, and show progress to tutors through records (e.g. `practiceSets.status`)
  rather than `useJobs`.
- Retries: `maxAttempts` per enqueue (default 1). 15-minute alarm limit; `backgroundJobTypes` for
  longer jobs.

## Q4. Does the knowledge binding index PDFs directly, or does text need extracting first? — **Unverified**

Refs: docs `/bindings/knowledge`; `worker.d.ts` `knowledge`, `KnowledgeClient`, `ScopedKnowledgeClient`.

- It needs `[[ai_search]] binding = "KNOWLEDGE" instance_name = "auto"` in `wrangler.toml`. It's
  owner-billed (text ingestion ≈ $0.825 / 1M tokens, hybrid search ≈ $0.825 / 1k queries).
- API as the doc expected: `knowledge(env).scoped({ folder }).add(file) / list() / search(q, { mode, limit })`,
  plus `remove(itemId)` on the root client. Item status values: `queued | running | completed | error | skipped | outdated`.
- The docs **don't say** whether PDFs are indexed. The only hint: "oversized non-text files are
  rejected" above **4 MiB per upload part**, so non-text files are accepted below that. The managed
  service is Cloudflare AI Search, which converts PDFs itself. My best guess is that PDFs are indexed
  directly, but this is a guess.
- **Consequences:** a PDF over **4 MiB** will be rejected, so the doc's 10 MB cap becomes 4 MiB for
  PDFs. Folder + filename must fit in 128 characters. Test in Phase 3 with a real worksheet PDF and
  `list({ status })`. Fallback if PDFs come back `error` / `skipped`: accept `.txt`/`.md` only, or
  extract text in the sandbox job.

## Q5. Rendering KaTeX inside the AI chat panel — **Confirmed (needs a decision in Phase 3)**

Refs: docs `/guides/ai-chat` ("Install the chat feature", "Custom chat UI").

- `ChatPanel` isn't exported by the SDK. `npx deepspace add ai-chat` copies it into
  `src/components/ChatPanel*.tsx` and adds **`react-markdown`, `remark-gfm`, `remark-breaks`,
  `rehype-highlight`, `highlight.js`** to `package.json`. These are outside the approved dependency
  list, so they need your OK.
- Because the panel is app code, KaTeX can be added to its Markdown renderer with
  `remark-math` + `rehype-katex` (more new dependencies). Without new dependencies, the option is a
  small custom chat UI using the documented wire helpers, rendering `$…$` with our own KaTeX
  component.
- **Billing finding:** the scaffold's chat route passes the **caller's** JWT, so each student pays
  for their own hints from their DeepSpace credits. For a tutoring app the hint assistant should
  probably bill the owner, with a per-session cap. That's your call in Phase 3.

---

## Other findings that affect later phases

- **Server action trust boundary (Confirmed):** `tools.*` runs with `X-App-Action: true` and bypasses
  RBAC. `tools.query` returns **every** row unless `where` scopes it. Server actions read full
  `users` rows, email included. Never return them.
- **Upsert:** `tools.create(coll, data, recordId)` merges into an existing row with that ID. A
  deterministic `recordId` per (problem, student) gives `submitAnswer` an upsert, and `uniqueOn` is
  the backstop.
- **Files (Confirmed):** `useR2Files()` defaults to scope `'self'` (only that user can read). `'app'`
  is **world-readable**. Server code uses `appFiles(env, { scope, userId })`, max 25 MiB per request.
  The free plan has a 128 MiB total. For practice-set PDFs: store under the tutor's `'self'` scope;
  students download through a small participant-checked route (Phase 3 decision).
- **Sandbox — Spike B passed (live app, 2026-11-21):** an owner-billed background job ran
  `claude-sonnet-5-5` with `codeExecutionTool()` and finished in **about 15 s**. It wrote
  `practice-test.pdf` (23,664 bytes, `%PDF-1.4`, 1 page, made by matplotlib 3.10.5) to `$OUTPUT_DIR`.
  The job downloaded it with `sandboxFiles`, saved it with
  `appFiles(env, { scope: 'self', userId: OWNER })`, and deleted the sandbox copy. The PDF had the
  title, a labelled correct-rate bar chart, and a practice problem with a correctly rendered exponent.
  Evidence: the `[spike-sandbox-pdf] ok` log line and `npx deepspace app files get … --private`.
  **API gotcha found:** `appFiles.download(key)` and `delete(key)` want the **full stored key**
  (`apps/<app>/users/<id>/…`, the `key` that `upload()`/`list()` return). The short relative key
  fails with `Access denied: key outside scope`, so the `key` from `upload()` is what goes on the
  `practiceSets` row.
- **Sandbox API (Confirmed in types):** `codeExecutionTool()`, `forwardSandboxContainer`,
  `sandboxOutputs(steps)`, `sandboxFiles(env).get/download/delete`. Use `streamText`, not
  `generateText`, to avoid a ~2-minute 524 timeout. Only files at the top level of `$OUTPUT_DIR` are
  exported. Needs a deploy first (`APP_IDENTITY_TOKEN`).
- **Local agent tools (Confirmed):** the scaffold's `registerAgent(app, { tools: buildTools })` exposes
  `buildTools` to any member's CLI (`npx deepspace agent invoke`), running as the caller, so RBAC
  applies. Trimming `ALLOWED_TOOL_NAMES` trims both surfaces. `buildTools(executor, context)` receives
  `{ env, userId, request }`.
- **Test accounts (Confirmed):**
  `npx deepspace test accounts create --email <name>@deepspace.test --password <pw> --name "<Name>"`.
  Needs your OAuth developer session. 10 per machine, shared across apps. Credentials go to
  `~/.deepspace/test-accounts.json` and must never be committed.

## Differences from REQUIREMENTS.md

| Doc says | Real API / finding | What we do |
| --- | --- | --- |
| `tutorIds` / `participantIds` as `'plain'` text holding a JSON string | `collaboratorsField` is a JSON array; use `{ kind: 'json' }` | json columns, pass arrays |
| `studentId` with `userBound: true` on `submissions` | `userBound` stamps the *writer's* ID on every write; wrong for server-written rows | no `userBound` on server-written collections; set from `ctx.userId` |
| `practiceSets` `update: 'own'` so the tutor can publish | Job-created rows are owned by the app owner, not the tutor | `update: false`; `publishPracticeSet` server action (already in the doc's coverage map) |
| `practiceSets.participantIds` readable from creation | Students could read the row and file reference before publishing | copy student IDs onto the row only when published |
| Notes PDFs ≤ 10 MB | Knowledge rejects non-text parts > 4 MiB | 4 MiB cap for PDFs |
| `this.enqueue` from the clustering job | Only on the `AppJobRoom` class | `onJob` wrapper chains the re-run |
| `ctx.progress` shows practice-set progress to the tutor | Job rows are visible to every member unless `authorizeRead` is tightened | admin-only job room; progress mirrored on the `practiceSets` row |
| `ChatPanel` is bundled | Installed by `add ai-chat`, with 5 Markdown dependencies | needs your approval in Phase 3 |
| Hint assistant cost not specified | Scaffold chat bills the student | your decision in Phase 3 |
| Notes up to 10 MB, storage 128 MiB | Confirmed 128 MiB free-plan quota | unchanged |
