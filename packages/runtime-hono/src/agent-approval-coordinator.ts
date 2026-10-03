import type { ResolvedAgent, WaitingApproval } from "./agent-approval-coordinator.types.js";
import type { PendingApproval } from "@relkit/agents";
import { type OperationId } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import { agentLimits, digest, encodedBytes } from "./agent-rpc-support.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { ActiveAgentExecution } from "./agent-active-execution.js";
import { Deferred, Effect, Exit, Scope } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import { currentHttpContextLayer } from "./http-logging.js";
import { claimRun, approvalDecisions, receiptExpiry } from "./agent-approval-support.js";
export { claimRun } from "./agent-approval-support.js";
/** Owns approval decisions and their batched journal writes for one accepted run. */
export class AgentApprovalCoordinator {
  private readonly waiting = new Map<string, WaitingApproval>();
  private readonly scope = Scope.makeUnsafe();
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
    if (existing !== undefined) return runHttp(Deferred.await(existing.decision));
    const decision = Deferred.makeUnsafe<"approved" | "denied", HttpBoundaryError>();
    this.waiting.set(approvalId, { approval, approvalId, decision });
    if (!this.flushQueued) {
      this.flushQueued = true;
      /** Observes the batched approval journal write inside the approval scope.
       * @returns A lazy flush effect whose failure completes every waiting decision.
       */
      const flush = () => observeHttp("agent.approval.flush", this.flushEffect());
      Effect.runFork(
        Effect.yieldNow.pipe(
          Effect.andThen(flush()),
          Effect.catch((error) =>
            Effect.forEach(this.waiting.values(), (entry) => Deferred.fail(entry.decision, error)),
          ),
          Effect.forkIn(this.scope),
          Effect.provide(currentHttpContextLayer()),
        ),
      );
    }
    return runHttp(Deferred.await(decision));
  };

  /** Joins pending journal writes and interrupts unresolved decisions on run completion.
   * @returns Completion after the approval scope closes and every unresolved decision is interrupted.
   */
  async close(): Promise<void> {
    await runHttp(Scope.close(this.scope, Exit.void));
    await runHttp(
      Effect.forEach(this.waiting.values(), (entry) => Deferred.interrupt(entry.decision)),
    );
    this.waiting.clear();
  }

  private readonly continueEffect = Effect.fn("AgentApprovals.continue")(
    (operationId: OperationId, payload: unknown, beforeResume?: () => Promise<void>) =>
      Effect.gen(
        function* (this: AgentApprovalCoordinator) {
          const entries = [...this.waiting.values()];
          if (entries.length === 0)
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.approval.continue",
                cause: new Error("No approval interruption is pending."),
              }),
            );
          const decisions = approvalDecisions(payload);
          if (entries.some(({ approvalId }) => decisions[approvalId] === undefined)) {
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.approval.continue",
                cause: new Error("Every open approval requires a decision."),
              }),
            );
          }
          const interruptSetDigest = entries[0]?.interruptSetDigest;
          if (
            interruptSetDigest === undefined ||
            entries.some((entry) => entry.interruptSetDigest !== interruptSetDigest)
          ) {
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.approval.continue",
                cause: new Error("Approval interrupt set is not ready."),
              }),
            );
          }
          const interruptedRunId = this.active.receipt.runId;
          const semanticDigest = digest({ interruptedRunId, interruptSetDigest, decisions });
          const continuation = yield* httpBoundary("agent.approval.continue", () =>
            Promise.resolve(
              this.resolved.provider.admitContinuation({
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
              }),
            ),
          );
          this.active.receipt = {
            operationId: continuation.operationId,
            threadId: continuation.threadId,
            runId: continuation.runId,
            status: "accepted",
            duplicate: continuation.duplicate,
          };
          this.active.controlRunIds.push(continuation.runId);
          this.active.claim = yield* httpBoundary("agent.approval.continue", () =>
            Promise.resolve(
              claimRun(this.resolved.provider, this.resolved, this.active.receipt, this.options),
            ),
          );
          yield* httpBoundary("agent.approval.continue", () => Promise.resolve(beforeResume?.()));
          for (const entry of entries) {
            this.waiting.delete(entry.approvalId);
            yield* Deferred.succeed(
              entry.decision,
              decisions[entry.approvalId] === "approve" ? "approved" : "denied",
            );
          }
        }.bind(this),
      ),
  );

  /** Admits a fenced approval continuation before releasing waiting tool calls.
   * @param operationId - Idempotency identifier for durable admission or lookup.
   * @param payload - Untrusted public payload validated before application use.
   * @param beforeResume - Optional durable settlement callback completed before tool execution resumes.
   * @returns Completion after durable admission, claim acquisition and release of all waiting decisions.
   */
  continue(
    operationId: OperationId,
    payload: unknown,
    beforeResume?: () => Promise<void>,
  ): Promise<void> {
    return runHttp(
      observeHttp(
        "agent.approval.continue",
        this.continueEffect(operationId, payload, beforeResume),
      ),
    );
  }

  private readonly flushEffect = Effect.fn("AgentApprovals.flush")(() =>
    Effect.gen(
      function* (this: AgentApprovalCoordinator) {
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
          yield* httpBoundary("agent.approval.flush", () =>
            Promise.resolve(
              this.resolved.provider.appendJournal({
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
              }),
            ),
          );
        }
      }.bind(this),
    ),
  );
}
