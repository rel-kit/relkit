import { Context, Effect, Layer } from "effect";
import { httpBoundary, observeHttp } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-run-journal.types.js";
import type { AcceptRunReceipt, ExecutionClaim, RunOwner } from "@relkit/agents";
import type { BrowserMessage } from "@relkit/contracts";

import { createOperationId } from "@relkit/realtime";
import { agentLimits, encodedBytes } from "./agent-rpc-support.js";

/** Projects an agent value into a user or assistant journal message.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param role - Public message role used to select the configured chat projection.
 * @param value - Value inspected, validated or projected by this operation.
 * @param messageId - Stable public message identifier retained across streaming updates.
 * @param createdAt - Public creation timestamp retained by the journal record.
 * @param state - State owned by the current request or operation.
 * @returns Completion after the projected text message is durably journaled.
 */
export const appendAgentMessageEffect = Effect.fn("AgentJournal.appendAgentMessage")(function* (
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  role: "user" | "assistant",
  value: unknown,
  messageId: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString(),
  state?: "streaming" | "complete",
) {
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
  yield* appendBrowserMessageEffect(resolved, receipt, claim, message);
});

/** Appends a bounded browser message under the current execution claim.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param message - Public message included in the resulting value or failure.
 * @returns Completion after the bounded browser message is durably journaled.
 */
export const appendBrowserMessageEffect = Effect.fn("AgentJournal.appendBrowserMessage")(function* (
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  message: BrowserMessage,
) {
  yield* httpBoundary("agent.appendBrowserMessage", () =>
    resolved.provider.appendJournal({
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
    }),
  );
});

/** Selects the configured chat field before rendering a public message.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param role - Public message role used to select the configured chat projection.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The configured chat text field, raw string input, or a JSON representation.
 */
export function publicAgentText(
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

/** Persists the terminal run outcome and receipt retention deadline.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param outcome - Terminal classification used for durable state and telemetry.
 * @param publicValue - Already projected public value admitted to durable storage.
 * @returns Completion after the terminal record and receipt retention are persisted.
 */
export const completeAgentRunEffect = Effect.fn("AgentJournal.completeAgentRun")(function* (
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  outcome: "succeeded" | "failed" | "cancelled",
  publicValue: unknown,
) {
  const now = new Date().toISOString();
  const terminalValue =
    publicValue !== null && typeof publicValue === "object" && !Array.isArray(publicValue)
      ? { ...publicValue, outcome }
      : { value: publicValue, outcome };
  yield* httpBoundary("agent.completeAgentRun", () =>
    resolved.provider.completeRun({
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
    }),
  );
});

/** Marks an owned run interrupted using its expected generation and fencing claim.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param expectedOwner - Expected generation and protocol owner used to fence interruption.
 * @param reason - Cancellation or interruption reason supplied by the owning boundary.
 * @returns Completion after the provider applies the fenced interruption.
 */
export const interruptAgentRunEffect = Effect.fn("AgentJournal.interruptAgentRun")(function* (
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  expectedOwner: RunOwner,
  reason?: "claim-expired" | "generation-unavailable" | "process-lost",
) {
  yield* httpBoundary("agent.interruptAgentRun", () =>
    resolved.provider.interruptOwnedRun({
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
    }),
  );
});

/** Lazy agent domain workflows with typed native failures. */
export class AgentJournal extends Context.Service<
  AgentJournal,
  {
    readonly appendAgentMessage: typeof appendAgentMessageEffect;
    readonly appendBrowserMessage: typeof appendBrowserMessageEffect;
    readonly completeAgentRun: typeof completeAgentRunEffect;
    readonly interruptAgentRun: typeof interruptAgentRunEffect;
  }
>()("@relkit/runtime-hono/AgentJournal") {}

/** Live operations; tests can replace the same contract. */
export const AgentJournalLive = Layer.succeed(AgentJournal, {
  appendAgentMessage: (...args) =>
    observeHttp("agent.appendAgentMessage", appendAgentMessageEffect(...args)),
  appendBrowserMessage: (...args) =>
    observeHttp("agent.appendBrowserMessage", appendBrowserMessageEffect(...args)),
  completeAgentRun: (...args) =>
    observeHttp("agent.completeAgentRun", completeAgentRunEffect(...args)),
  interruptAgentRun: (...args) =>
    observeHttp("agent.interruptAgentRun", interruptAgentRunEffect(...args)),
});
