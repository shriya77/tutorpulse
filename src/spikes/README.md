# Phase 0 spikes (temporary — removed before Phase 1)

Throwaway code that proves two platform paths work on the deployed app before
any feature depends on them. Every spike tool is **owner-only** (it spends the
owner's AI credits) and is reached through the local-agent CLI, so no UI or
public route is involved.

| Spike | Proves | How to run (after deploy) |
| --- | --- | --- |
| A | `createDeepSpaceAI(env, 'anthropic')` + `generateText` returns usable JSON, both via `Output.object` (structured output) and via a plain "reply with JSON" prompt | `npx deepspace agent invoke tutorpulse spike_generate_json --json` |
| B | A background job can run Claude's `code_execution` sandbox, write a PDF to `$OUTPUT_DIR`, download it, and store it with `appFiles` | `npx deepspace agent invoke tutorpulse spike_sandbox_enqueue --json`, wait ~1–2 min, then `npx deepspace agent invoke tutorpulse spike_sandbox_result --json` |
