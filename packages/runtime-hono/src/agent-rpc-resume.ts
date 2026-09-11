import {
  isGraphDescriptor,
  validateGraphResumeInput,
  validateNativeAgentResumeInput,
} from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import {
  agentContext,
  digest,
  type AgentInput,
  verifiedAgentRequestDigest,
} from "./agent-rpc-support.js";
import { startAgentRun } from "./agent-rpc-worker.js";
import { waitForAgentRun } from "./agent-run-tasks.js";
import { assertAgentRunWritable } from "./agent-compatibility.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

export async function acceptAgentResume(
  input: AgentInput,
  threadId: string,
  operationId: OperationId,
  resolved: ResolvedAgent,
  options: RouteMaterializationOptions,
) {
  if (typeof input.waitingRevision !== "string" || input.waitingRevision.length === 0) {
    throw new TypeError("Agent resume requires the observed waiting revision.");
  }
  const requestDigest = verifiedAgentRequestDigest(input);
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  const waiting = snapshot.waiting;
  assertAgentRunWritable(snapshot, waiting?.runId);
  if (waiting === undefined) {
    const prior = await resolved.provider.lookupContinuationReceipt({
      ...resolved.scope,
      operationId,
      threadId,
      semanticDigest: requestDigest,
      now: new Date().toISOString(),
    });
    if (prior.status === "found") {
      const accepted = asAcceptedRun({ ...prior.receipt, duplicate: true });
      startAgentRun(resolved, accepted, input.payload, options, true);
      return accepted;
    }
    throw new TypeError("Agent has no waiting continuation.");
  }
  if (input.waitingRevision !== waiting.revision) {
    throw new TypeError("Agent waiting revision is stale.");
  }
  let reply: unknown;
  try {
    reply = isGraphDescriptor(resolved.descriptor)
      ? await validateGraphResumeInput(resolved.descriptor, waiting.requests, input.payload)
      : validateNativeAgentResumeInput(waiting.requests, input.payload);
  } catch {
    throw new TypeError("Agent resume input validation failed.");
  }
  await waitForAgentRun(waiting.runId);
  const continuation = await resolved.provider.admitContinuation({
    ...resolved.scope,
    kind: "resume",
    operationId,
    semanticDigest: requestDigest,
    threadId,
    interruptedRunId: waiting.runId,
    interruptSetDigest: digest(waiting),
    waitingRevision: waiting.revision,
    admittedAt: new Date().toISOString(),
    receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
  });
  const accepted = asAcceptedRun(continuation);
  startAgentRun(resolved, accepted, reply, options, true);
  return accepted;
}

function asAcceptedRun(continuation: {
  readonly operationId: OperationId;
  readonly threadId: string;
  readonly runId: string;
  readonly duplicate: boolean;
}) {
  return {
    operationId: continuation.operationId,
    threadId: continuation.threadId,
    runId: continuation.runId,
    status: "accepted" as const,
    duplicate: continuation.duplicate,
  };
}
