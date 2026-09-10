import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  REALTIME_RUNTIME_LIMITS,
} from "@relkit/contracts";
import { createOperationId, parseOperationId } from "@relkit/realtime";
import { ORPCError } from "@orpc/server";
import { assertExpectedIdentity, assertRpcSecurity } from "./rpc-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import {
  agentContext,
  agentLimits,
  digest,
  requireAgentThreadId,
  type AgentInput,
  validateAgentInput,
  verifiedAgentRequestDigest,
} from "./agent-rpc-support.js";
import { acceptAgentResume } from "./agent-rpc-resume.js";
import { startAgentRun } from "./agent-rpc-worker.js";
import { assertAgentRunWritable } from "./agent-compatibility.js";

export async function acceptAgentRun(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertWrite(input, context, options);
  const threadId = requireAgentThreadId(input.threadId);
  if (input.resume !== undefined && input.resume !== true)
    throw new TypeError("resume must be true when supplied.");
  const operationId = requiredOperationId(input.operationId);
  const resolved = await agentContext(
    { ...input, threadId },
    context,
    options,
    input.resume === true ? "resume" : "run",
  );
  if (input.resume === true) {
    return acceptAgentResume(input, threadId, operationId, resolved, options);
  }
  const requestDigest = verifiedAgentRequestDigest(input);
  const value = await validateAgentInput(resolved, input.payload);
  const now = new Date().toISOString();
  await resolved.provider.createThread({
    ...resolved.scope,
    operationId,
    threadId,
    semanticDigest: digest({ agentId: input.agentId, threadId }),
    now,
    limits: agentLimits,
  });
  const accepted = await resolved.provider.acceptRun({
    ...resolved.scope,
    operationId,
    semanticDigest: requestDigest,
    threadId,
    owner: {
      generationId: options.agentRuntime!.generationId,
      publicFingerprint: options.agentRuntime!.publicFingerprint,
      protocolVersion: AGENT_STREAM_VERSION,
      schemaVersion: AGENT_STATE_SCHEMA_VERSION,
      providerScope: resolved.scope.profile,
    },
    input: value,
    inputDigest: digest(value),
    acceptedAt: now,
    receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
    limits: agentLimits,
  });
  startAgentRun(resolved, accepted, value, options, false);
  return accepted;
}

export async function acceptAgentControl(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertWrite(input, context, options);
  const threadId = requireAgentThreadId(input.threadId);
  if (!isControlPayload(input.kind, input.payload))
    throw new TypeError("Control request is invalid.");
  const operationId = requiredOperationId(input.operationId);
  const resolved = await agentContext({ ...input, threadId }, context, options, input.kind!);
  const requestDigest = verifiedAgentRequestDigest(input);
  if (!Array.isArray(resolved.node.controls) || !resolved.node.controls.includes(input.kind))
    throw new Error("Agent control is not declared.");
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  const runId = snapshot.activeRun?.runId;
  if (runId === undefined) throw new Error("Agent has no active run.");
  assertAgentRunWritable(snapshot, runId);
  if (
    snapshot.thread.status === "worker-interrupted" &&
    snapshot.activeRun?.owner.generationId !== options.agentRuntime!.generationId
  ) {
    throw new ORPCError("GENERATION_UNAVAILABLE", {
      message: "The run's owning generation is unavailable.",
    });
  }
  const now = new Date().toISOString();
  return resolved.provider.acceptControl({
    ...resolved.scope,
    operationId,
    semanticDigest: requestDigest,
    threadId,
    runId,
    kind: input.kind as "steer" | "follow-up" | "stop" | "approve",
    publicPayload: input.payload,
    acceptedAt: now,
    receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
    limits: {
      maxQueuedPerRun: REALTIME_RUNTIME_LIMITS.controlsPerRun,
      maxQueuedPerApplication: REALTIME_RUNTIME_LIMITS.controlsPerApplication,
    },
  });
}

async function assertWrite(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
  if (options.transportSecurity !== undefined)
    await assertRpcSecurity(context, options.transportSecurity);
}

function requiredOperationId(value: string | undefined) {
  return parseOperationId(value ?? createOperationId(), {
    receiptWindowMs: REALTIME_RUNTIME_LIMITS.agentReceiptMs,
  });
}

function isControlPayload(kind: string | undefined, value: unknown): value is object | string {
  if (kind === "steer" || kind === "follow-up") return typeof value === "string";
  return value !== null && typeof value === "object";
}
