/**
 * Per-session AI usage caps (REQUIREMENTS → Non-functional → AI cost).
 * Counters live on the session row (`clusterRuns`, `practiceSetRuns`) and are
 * incremented by server code only; actions check them before enqueueing work.
 */
export const MAX_CLUSTER_RUNS_PER_SESSION = 30
export const MAX_PRACTICE_SETS_PER_SESSION = 5

/** Hint-assistant turns per session (owner-billed; REQUIREMENTS → AI cost). */
export const MAX_HINT_TURNS_PER_SESSION = 200

/** Notes uploads: the knowledge base rejects non-text parts over 4 MiB (docs/SDK_NOTES.md Q4). */
export const MAX_NOTES_BYTES = 4 * 1024 * 1024
export const NOTES_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown']

/** Handwritten working: one PNG per answer, downscaled in the browser. */
export const MAX_WORK_BYTES = 1024 * 1024
/** Working images sent to the clustering model per run (cost and latency). */
export const MAX_WORK_IMAGES_PER_RUN = 12

/** AI follow-up problem drafts per session (owner-billed). */
export const MAX_FOLLOWUP_DRAFTS_PER_SESSION = 15
