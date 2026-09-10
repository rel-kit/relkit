import type { ThreadSnapshot } from "@relkit/contracts";
import { snapshotProjection } from "./agent-execution-observation.js";
import type { AgentBase } from "./agent-hook-types.js";
import { agentContentFromMessages } from "./agent-observation.js";

export function applyAgentSnapshot<Output>(
  current: AgentBase<Output>,
  snapshot: ThreadSnapshot,
): AgentBase<Output> {
  const {
    values: _values,
    output: _output,
    executions: _executions,
    waiting: _waiting,
    ...base
  } = current;
  const typedSnapshot = snapshot as unknown as NonNullable<AgentBase<Output>["snapshot"]>;
  return {
    ...base,
    status: snapshotStatus(snapshot),
    threadId: snapshot.thread.threadId,
    ...agentContentFromMessages(snapshot.currentMessages),
    ...snapshotProjection<Output>(snapshot),
    snapshot: typedSnapshot,
    ...(snapshot.waiting === undefined
      ? {}
      : { waiting: snapshot.waiting as NonNullable<AgentBase<Output>["waiting"]> }),
  };
}

function snapshotStatus(snapshot: ThreadSnapshot): AgentBase<unknown>["status"] {
  if (snapshot.activeRun !== undefined) return snapshot.thread.status;
  const latest = [...snapshot.currentRuns].sort((left, right) =>
    right.acceptedAt.localeCompare(left.acceptedAt),
  )[0];
  if (latest?.status === "accepted") return "running";
  return latest?.status ?? snapshot.thread.status;
}
