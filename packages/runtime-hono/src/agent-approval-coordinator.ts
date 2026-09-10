import type {
  AcceptRunReceipt,
  AgentStateProvider,
  ExecutionClaim,
  PendingApproval,
} from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS, type OperationId } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import type { agentContext } from "./agent-rpc-support.js";
import { agentLimits, digest, encodedBytes } from "./agent-rpc-support.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { ActiveAgentExecution } from "./agent-active-execution.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

interface WaitingApproval {
  readonly approval: PendingApproval;
  readonly approvalId: string;
  interruptSetDigest?: string;
  resolve: (decision: "approved" | "denied") => void;
}

export class AgentApprovalCoordinator {
  private readonly waiting = new Map<string, WaitingApproval>();
  private flushQueued = false;

  constructor(
    private readonly resolved: ResolvedAgent,
    private readonly active: ActiveAgentExecution,
    private readonly options: RouteMaterializationOptions,
  ) {}

  readonly request = (approval: PendingApproval): Promise<"approved" | "denied"> => {
    const approvalId = digest({
      runId: this.active.receipt.runId,
      invocationId: approval.invocationId,
      toolCallId: approval.toolCallId,
    });
    const existing = this.waiting.get(approvalId);
    if (existing !== undefined)
      return new Promise((resolve) => {
        const original = existing.resolve;
        existing.resolve = (decision) => {
          original(decision);
          resolve(decision);
        };
      });
    const result = new Promise<"approved" | "denied">((resolve) => {
      this.waiting.set(approvalId, { approval, approvalId, resolve });
    });
    if (!this.flushQueued) {
      this.flushQueued = true;
      queueMicrotask(() => void this.flush());
    }
    return result;
  };

  async continue(
    operationId: OperationId,
    payload: unknown,
    beforeResume?: () => Promise<void>,
  ): Promise<void> {
    const entries = [...this.waiting.values()];
    if (entries.length === 0) throw new Error("No approval interruption is pending.");
    const decisions = approvalDecisions(payload);
    if (entries.some(({ approvalId }) => decisions[approvalId] === undefined)) {
      throw new Error("Every open approval requires a decision.");
    }
    const interruptSetDigest = entries[0]?.interruptSetDigest;
    if (
      interruptSetDigest === undefined ||
      entries.some((entry) => entry.interruptSetDigest !== interruptSetDigest)
    ) {
      throw new Error("Approval interrupt set is not ready.");
    }
    const interruptedRunId = this.active.receipt.runId;
    const semanticDigest = digest({ interruptedRunId, interruptSetDigest, decisions });
    const continuation = await this.resolved.provider.admitContinuation({
      ...this.resolved.scope,
      operationId,
      semanticDigest,
      kind: "approval",
      threadId: this.active.receipt.threadId,
      interruptedRunId,
      interruptSetDigest,
      decisions,
      admittedAt: new Date().toISOString(),
      receiptExpiresAt: receiptExpiry(),
    });
    this.active.receipt = {
      operationId: continuation.operationId,
      threadId: continuation.threadId,
      runId: continuation.runId,
      status: "accepted",
      duplicate: continuation.duplicate,
    };
    this.active.controlRunIds.push(continuation.runId);
    this.active.claim = await claimRun(
      this.resolved.provider,
      this.resolved,
      this.active.receipt,
      this.options,
    );
    await beforeResume?.();
    for (const entry of entries) {
      this.waiting.delete(entry.approvalId);
      entry.resolve(decisions[entry.approvalId] === "approve" ? "approved" : "denied");
    }
  }

  private async flush(): Promise<void> {
    this.flushQueued = false;
    const entries = [...this.waiting.values()].filter(
      (entry) => entry.interruptSetDigest === undefined,
    );
    if (entries.length === 0) return;
    const interruptSetDigest = digest(entries.map(({ approvalId }) => approvalId).sort());
    for (const entry of entries) {
      entry.interruptSetDigest = interruptSetDigest;
      const value = {
        approvalId: entry.approvalId,
        runId: this.active.receipt.runId,
        interruptSetDigest,
        interruptSetSize: entries.length,
        status: "open" as const,
        publicRequest: {
          toolCallId: entry.approval.toolCallId,
          toolId: entry.approval.toolId,
          sideEffect: entry.approval.sideEffect,
        },
      };
      await this.resolved.provider.appendJournal({
        ...this.resolved.scope,
        threadId: this.active.receipt.threadId,
        runId: this.active.receipt.runId,
        claim: this.active.claim,
        operationId: createOperationId(),
        semanticDigest: digest(value),
        record: {
          recordId: crypto.randomUUID(),
          runId: this.active.receipt.runId,
          kind: "approval",
          publicValue: value,
          encodedBytes: encodedBytes(value),
          createdAt: new Date().toISOString(),
        },
        limits: agentLimits,
      });
    }
  }
}

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

function approvalDecisions(value: unknown): Readonly<Record<string, "approve" | "deny">> {
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

function isDecision(value: unknown): value is "approve" | "deny" {
  return value === "approve" || value === "deny";
}

function receiptExpiry(): string {
  return new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString();
}
