import type { JournalCheckpoint, ThreadSnapshot } from "@relkit/contracts";
import type { Effect } from "effect";
import type { AgentBase } from "./agent-hook-types.types.js";

/**
 * State publication remains borrowed from the calling view.
 * @typeParam Output - Application-declared successful result payload.
 */
export type AgentUpdate<Output> = (
  value: AgentBase<Output> | ((current: AgentBase<Output>) => AgentBase<Output>),
) => void;
/** Complete identity authority supplied to an observation or submission. */
export interface AgentIdentity {
  readonly identityScope: string;
  readonly sessionEpoch: string;
}
/** A continuation digest binds input to the authoritative waiting revision. */
export interface PreparedContinuation {
  readonly waitingRevision: string;
  readonly digestValue: { readonly payload: unknown; readonly waitingRevision: string };
}
/** Receipt lookup preserves the existing finite recovery alternatives. */
export type AgentReceiptLookup =
  | { readonly status: "found"; readonly receipt: { readonly threadId: string } }
  | { readonly status: "not-found" | "expired" | "state-lost" };
/** Request state for a single accepted-work submission. */
export interface AgentSubmission {
  readonly client: unknown;
  readonly scopeKey: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly identity: AgentIdentity | undefined;
  readonly kind: string;
  readonly payload: unknown;
  readonly resume?: boolean;
  readonly snapshot?: ThreadSnapshot;
  readonly activeRunId?: string;
}
/** Checkpoint state belongs to one observation fiber. */
export interface AgentObservationCursor {
  checkpoint: JournalCheckpoint;
  runId: string | undefined;
}
/** Cohesive agent recovery and accepted-work contract, independent of React. */
export interface AgentOperationsService {
  /** Observes durable thread snapshots and ordered frames until view retirement.
   * @typeParam Output - Application-declared terminal output payload.
   * @param client - Borrowed finite procedure transport.
   * @param streamClient - Borrowed native observation transport.
   * @param agentId - Declared agent key.
   * @param threadId - Caller-owned durable thread identity.
   * @param identity - Complete authorization and session boundary.
   * @param signal - View lifetime propagated to native observations.
   * @param update - Isolated external-store publication.
   * @returns A lazy scoped recovery workflow preserving native errors. */
  readonly observe: <Output>(
    client: unknown,
    streamClient: unknown,
    agentId: string,
    threadId: string,
    identity: AgentIdentity | undefined,
    signal: AbortSignal,
    update: AgentUpdate<Output>,
  ) => Effect.Effect<void, unknown>;
  /** Binds continuation input to an authoritative waiting revision.
   * @param client - Borrowed finite procedure transport.
   * @param agentId - Declared agent key.
   * @param threadId - Caller-owned durable thread identity.
   * @param payload - Original transmitted continuation payload.
   * @param current - Matching authoritative snapshot when already available.
   * @returns A lazy observed revision and digest input or original native failure. */
  readonly continuation: (
    client: unknown,
    agentId: string,
    threadId: string,
    payload: unknown,
    current?: ThreadSnapshot,
  ) => Effect.Effect<PreparedContinuation, unknown>;
  /** Reconciles stored receipts with durable thread identity.
   * @param client - Borrowed receipt lookup transport.
   * @param scopeKey - Complete pending isolation scope.
   * @param agentId - Declared agent key.
   * @param signal - View lifetime for receipt observations.
   * @returns A lazy observed restored thread identity or original native failure. */
  readonly reconcile: (
    client: unknown,
    scopeKey: string,
    agentId: string,
    signal: AbortSignal,
  ) => Effect.Effect<string | undefined, unknown>;
  /** Dispatches accepted agent work independently of observation cancellation.
   * @param request - Complete identity, input, continuation and pending authority.
   * @returns A lazy observed original receipt or original native rejection. */
  readonly submit: (request: AgentSubmission) => Effect.Effect<unknown, unknown>;
}
