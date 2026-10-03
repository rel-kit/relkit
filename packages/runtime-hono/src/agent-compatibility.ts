import { ORPCError } from "@orpc/server";
import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  type AgentRunCompatibility,
  type StoredRun,
  type ThreadSnapshot,
} from "@relkit/contracts";

/** Classify persisted run versions and whether their checkpoint can resume.
 * @param run - Persisted run being inspected.
 * @param waitingRunId - Run ID owning the resumable waiting checkpoint.
 * @returns Native read-write or historical read-only compatibility metadata.
 */
export function agentRunCompatibility(
  run: StoredRun | undefined,
  waitingRunId?: string,
): AgentRunCompatibility {
  if (run === undefined) {
    return { runtime: "native", access: "read-write", resumableCheckpoint: false };
  }
  const owner = run.owner as Partial<StoredRun["owner"]> | undefined;
  const native =
    owner?.protocolVersion === AGENT_STREAM_VERSION &&
    owner.schemaVersion === AGENT_STATE_SCHEMA_VERSION;
  return {
    runtime: native ? "native" : "ai-sdk",
    access: native ? "read-write" : "read-only",
    resumableCheckpoint: native && waitingRunId === run.runId,
    ...(typeof owner?.protocolVersion === "number"
      ? { protocolVersion: owner.protocolVersion }
      : {}),
    ...(typeof owner?.schemaVersion === "number" ? { schemaVersion: owner.schemaVersion } : {}),
  };
}

/** Attach compatibility metadata and hide checkpoints for historical runs.
 * @param snapshot - Current thread snapshot.
 * @returns The client snapshot with resumable state only for writable runs.
 */
export function clientAgentSnapshot(snapshot: ThreadSnapshot): ThreadSnapshot {
  const run = currentRun(snapshot);
  const compatibility = agentRunCompatibility(run, snapshot.waiting?.runId);
  if (compatibility.access === "read-write") return { ...snapshot, compatibility };
  const { waiting: _waiting, ...readOnly } = snapshot;
  return { ...readOnly, compatibility };
}

/** Reject mutations of historical runs without a native checkpoint.
 * @param snapshot - Current thread snapshot.
 * @param runId - Selected run identifier.
 * @returns Nothing for writable runs; otherwise throws AGENT_RUN_READ_ONLY.
 */
export function assertAgentRunWritable(snapshot: ThreadSnapshot, runId?: string): void {
  const run =
    runId === undefined
      ? currentRun(snapshot)
      : snapshot.currentRuns.find((candidate) => candidate.runId === runId);
  if (agentRunCompatibility(run, snapshot.waiting?.runId).access === "read-write") return;
  throw new ORPCError("AGENT_RUN_READ_ONLY", {
    message: "Historical AI SDK runs are read-only and have no native resumable checkpoint.",
  });
}

/** Select the active run or the most recently accepted stored run.
 * @param snapshot - Current thread snapshot.
 * @returns The selected run, or undefined when the thread has none.
 */
function currentRun(snapshot: ThreadSnapshot): StoredRun | undefined {
  const active = snapshot.activeRun?.runId;
  if (active !== undefined) {
    const run = snapshot.currentRuns.find((candidate) => candidate.runId === active);
    if (run !== undefined) return run;
  }
  return [...snapshot.currentRuns].sort((left, right) =>
    right.acceptedAt.localeCompare(left.acceptedAt),
  )[0];
}
