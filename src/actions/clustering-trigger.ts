/**
 * Debounced trigger for the `cluster-problem` job (REQUIREMENTS → Rules of the
 * core loop: "at most one clustering job per problem in flight").
 *
 *   clusterState idle    → set running, enqueue the job
 *   clusterState running → set dirty (the job re-runs once when it finishes)
 *   clusterState dirty   → nothing to do
 *
 * The per-session AI cap is enforced inside the job (it falls back to
 * identical-answer grouping, which costs nothing), so a capped session still
 * gets its board updated.
 */

import { enqueueJob } from 'deepspace/worker'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Envelope, ProblemData } from './types'

export const CLUSTER_JOB = 'cluster-problem'

export interface ClusterJobPayload {
  problemId: string
}

export async function requestClustering(
  env: Env,
  tools: ActionTools,
  problem: Envelope<ProblemData>,
): Promise<'enqueued' | 'marked_dirty' | 'already_dirty'> {
  const state = problem.data.clusterState ?? 'idle'
  if (state === 'dirty') return 'already_dirty'
  if (state === 'running') {
    await tools.update('problems', problem.recordId, { clusterState: 'dirty' })
    return 'marked_dirty'
  }
  await tools.update('problems', problem.recordId, { clusterState: 'running' })
  const payload: ClusterJobPayload = { problemId: problem.recordId }
  await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, CLUSTER_JOB, payload, { maxAttempts: 2 })
  return 'enqueued'
}
