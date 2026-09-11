import { ORPCError } from "@orpc/server";
import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  type AgentRunCompatibility,
  type StoredRun,
  type ThreadSnapshot,
} from "@relkit/contracts";

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

export function clientAgentSnapshot(snapshot: ThreadSnapshot): ThreadSnapshot {
  const run = currentRun(snapshot);
  const compatibility = agentRunCompatibility(run, snapshot.waiting?.runId);
  if (compatibility.access === "read-write") return { ...snapshot, compatibility };
  const { waiting: _waiting, ...readOnly } = snapshot;
  return { ...readOnly, compatibility };
}

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
