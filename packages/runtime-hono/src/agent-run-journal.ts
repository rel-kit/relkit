import type { AcceptRunReceipt, ExecutionClaim, RunOwner } from "@relkit/agents";
import type { BrowserMessage } from "@relkit/contracts";
import { AGENT_STATE_SCHEMA_VERSION, AGENT_STREAM_VERSION } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import type { agentContext } from "./agent-rpc-support.js";
import { agentLimits, encodedBytes } from "./agent-rpc-support.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

export async function appendAgentMessage(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  role: "user" | "assistant",
  value: unknown,
  messageId: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString(),
  state?: "streaming" | "complete",
): Promise<void> {
  const message = {
    messageId,
    runId: receipt.runId,
    role,
    parts: [
      {
        partId: `${messageId}:text`,
        kind: "text" as const,
        text: publicAgentText(resolved, role, value),
        ...(state === undefined ? {} : { state }),
      },
    ],
    createdAt,
  };
  await appendBrowserMessage(resolved, receipt, claim, message);
}

export async function appendBrowserMessage(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  message: BrowserMessage,
): Promise<void> {
  await resolved.provider.appendJournal({
    ...resolved.scope,
    threadId: receipt.threadId,
    runId: receipt.runId,
    claim,
    operationId: createOperationId(),
    semanticDigest: JSON.stringify(message),
    record: {
      recordId: crypto.randomUUID(),
      runId: receipt.runId,
      kind: "message",
      publicValue: message,
      encodedBytes: encodedBytes(message),
      createdAt: message.createdAt,
    },
    limits: agentLimits,
  });
}

function publicAgentText(
  resolved: ResolvedAgent,
  role: "user" | "assistant",
  value: unknown,
): string {
  const output =
    role === "user" ? resolved.descriptor.chat?.input : resolved.descriptor.chat?.output;
  if (
    typeof output === "string" &&
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>)[output] === "string"
  )
    return (value as Record<string, string>)[output]!;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function completeAgentRun(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  outcome: "succeeded" | "failed" | "cancelled",
  publicValue: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const terminalValue =
    publicValue !== null && typeof publicValue === "object" && !Array.isArray(publicValue)
      ? { ...publicValue, outcome }
      : { value: publicValue, outcome };
  await resolved.provider.completeRun({
    ...resolved.scope,
    operationId: createOperationId(),
    semanticDigest: `${receipt.runId}:${outcome}`,
    threadId: receipt.threadId,
    runId: receipt.runId,
    claim,
    outcome,
    terminalRecord: {
      recordId: crypto.randomUUID(),
      runId: receipt.runId,
      kind: "terminal",
      publicValue: terminalValue,
      encodedBytes: encodedBytes(terminalValue),
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
}

export async function interruptAgentRun(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  expectedOwner: RunOwner,
  reason?: "claim-expired" | "generation-unavailable" | "process-lost",
): Promise<void> {
  await resolved.provider.interruptOwnedRun({
    ...resolved.scope,
    operationId: createOperationId(),
    threadId: receipt.threadId,
    runId: receipt.runId,
    expectedOwner,
    expectedClaimId: claim.claimId,
    expectedFence: claim.fence,
    reason:
      reason ?? (Date.parse(claim.expiresAt) <= Date.now() ? "claim-expired" : "process-lost"),
    interruptedAt: new Date().toISOString(),
  });
}

export function agentRunOwner(options: RouteMaterializationOptions, profile: string): RunOwner {
  return {
    generationId: options.agentRuntime!.generationId,
    publicFingerprint: options.agentRuntime!.publicFingerprint,
    protocolVersion: AGENT_STREAM_VERSION,
    schemaVersion: AGENT_STATE_SCHEMA_VERSION,
    providerScope: profile,
  };
}
