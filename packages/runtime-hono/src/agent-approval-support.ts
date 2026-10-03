import type { ResolvedAgent } from "./agent-approval-coordinator.types.js";
import type { AcceptRunReceipt, AgentStateProvider, ExecutionClaim } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";

import type { RouteMaterializationOptions } from "./materialize-routes.js";

/** Claims the accepted run for the active generation with a bounded lease.
 * @param provider - Foreign provider whose native API owns durable state.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The acquired execution claim containing its fencing token and lease expiry.
 */
export function claimRun(
  provider: AgentStateProvider,
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  options: RouteMaterializationOptions,
): Promise<ExecutionClaim> {
  return provider.claimRun({
    ...resolved.scope,
    threadId: receipt.threadId,
    runId: receipt.runId,
    workerId: crypto.randomUUID(),
    generationId: options.agentRuntime!.generationId,
    expiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.leaseExpiryMs).toISOString(),
  });
}

/** Normalizes single and batched approval payloads into recognized decisions.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Recognized approve or deny values keyed by approval identifier.
 */
export function approvalDecisions(value: unknown): Readonly<Record<string, "approve" | "deny">> {
  if (value === null || typeof value !== "object") return {};
  const payload = value as { approvalId?: unknown; decision?: unknown; decisions?: unknown };
  if (typeof payload.approvalId === "string" && isDecision(payload.decision)) {
    return { [payload.approvalId]: payload.decision };
  }
  if (payload.decisions === null || typeof payload.decisions !== "object") return {};
  return Object.fromEntries(
    Object.entries(payload.decisions).filter((entry): entry is [string, "approve" | "deny"] =>
      isDecision(entry[1]),
    ),
  );
}

/** Recognizes the two supported approval decision literals.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
export function isDecision(value: unknown): value is "approve" | "deny" {
  return value === "approve" || value === "deny";
}

/** Computes the bounded retention deadline for an agent receipt.
 * @returns The ISO receipt-expiry timestamp computed from the configured retention limit.
 */
export function receiptExpiry(): string {
  return new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString();
}
