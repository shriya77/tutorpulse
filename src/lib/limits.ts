/**
 * Per-session AI usage caps (REQUIREMENTS → Non-functional → AI cost).
 * Counters live on the session row (`clusterRuns`, `practiceSetRuns`) and are
 * incremented by server code only; actions check them before enqueueing work.
 */
export const MAX_CLUSTER_RUNS_PER_SESSION = 30
export const MAX_PRACTICE_SETS_PER_SESSION = 5
