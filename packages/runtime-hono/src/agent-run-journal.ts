import { Effect } from "effect";
import { runHttp } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-run-journal.types.js";
import type { AcceptRunReceipt, ExecutionClaim, RunOwner } from "@relkit/agents";
import type { BrowserMessage } from "@relkit/contracts";
import { AGENT_STATE_SCHEMA_VERSION, AGENT_STREAM_VERSION } from "@relkit/contracts";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { AgentJournal, AgentJournalLive } from "./agent-journal.js";
export { AgentJournal, AgentJournalLive } from "./agent-journal.js";
/** Executes appendAgentMessage at the native Promise boundary.
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
export function appendAgentMessage(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  role: "user" | "assistant",
  value: unknown,
  messageId: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString(),
  state?: "streaming" | "complete",
): Promise<void> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentJournal;
      return yield* service.appendAgentMessage(
        resolved,
        receipt,
        claim,
        role,
        value,
        messageId,
        createdAt,
        state,
      );
    }).pipe(Effect.provide(AgentJournalLive)),
  );
}

/** Executes appendBrowserMessage at the native Promise boundary.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param message - Public message included in the resulting value or failure.
 * @returns Completion after the bounded browser message is durably journaled.
 */
export function appendBrowserMessage(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  message: BrowserMessage,
): Promise<void> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentJournal;
      return yield* service.appendBrowserMessage(resolved, receipt, claim, message);
    }).pipe(Effect.provide(AgentJournalLive)),
  );
}

/** Executes completeAgentRun at the native Promise boundary.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param outcome - Terminal classification used for durable state and telemetry.
 * @param publicValue - Already projected public value admitted to durable storage.
 * @returns Completion after the terminal record and receipt retention are persisted.
 */
export function completeAgentRun(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  outcome: "succeeded" | "failed" | "cancelled",
  publicValue: unknown,
): Promise<void> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentJournal;
      return yield* service.completeAgentRun(resolved, receipt, claim, outcome, publicValue);
    }).pipe(Effect.provide(AgentJournalLive)),
  );
}

/** Executes interruptAgentRun at the native Promise boundary.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param claim - Current fenced execution claim required by the provider.
 * @param expectedOwner - Expected generation and protocol owner used to fence interruption.
 * @param reason - Cancellation or interruption reason supplied by the owning boundary.
 * @returns Completion after the provider applies the fenced interruption.
 */
export function interruptAgentRun(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  claim: ExecutionClaim,
  expectedOwner: RunOwner,
  reason?: "claim-expired" | "generation-unavailable" | "process-lost",
): Promise<void> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentJournal;
      return yield* service.interruptAgentRun(resolved, receipt, claim, expectedOwner, reason);
    }).pipe(Effect.provide(AgentJournalLive)),
  );
}

/** Builds the generation and protocol ownership descriptor for durable run claims.
 * @param options - Application dependencies and configuration for this domain.
 * @param profile - Configured provider profile used to select durable state.
 * @returns The current generation, protocol and provider-scope owner used for fencing.
 */
export function agentRunOwner(options: RouteMaterializationOptions, profile: string): RunOwner {
  return {
    generationId: options.agentRuntime!.generationId,
    publicFingerprint: options.agentRuntime!.publicFingerprint,
    protocolVersion: AGENT_STREAM_VERSION,
    schemaVersion: AGENT_STATE_SCHEMA_VERSION,
    providerScope: profile,
  };
}
