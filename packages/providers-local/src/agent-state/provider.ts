/** Composes filesystem-backed agent-state operations and their Promise compatibility boundary. */
import { promiseProvider, runAndControlOperations } from "./provider-operations.js";
import { Context, Effect, Layer } from "effect";
import { localOperation, localPromise, runLocalSync } from "../local-effect.js";
import type { AgentStateEffects, LocalAgentStateProviderOptions } from "./provider.types.js";
import type { AgentStateStoreEffects } from "./storage.js";
import type { AgentStateProvider } from "@relkit/contracts";

import { admitContinuation, lookupContinuation } from "./continuations.js";

import { recoverExpiredControls } from "./control-recovery.js";

import { recoverExpiredRun } from "./run-recovery.js";
import { createAgentStateStore, makeAgentStateStore } from "./storage.js";
import { loadThread, readSnapshotHistory } from "./threads.js";
import { createThread } from "./thread-create.js";
import { listThreads } from "./thread-list.js";

export type { LocalAgentStateProviderOptions } from "./provider.types.js";

/**
 * Creates the filesystem-backed agent-state compatibility provider.
 * @param root - Owned state directory.
 * @param options - Bounded journal and control observation interval.
 * @returns Promise operations preserving public receipts and errors.
 */
export function createLocalAgentStateProvider(
  root: string,
  options: LocalAgentStateProviderOptions = {},
): AgentStateProvider {
  const store = runLocalSync(makeAgentStateStore(root));
  const pollingMs = options.pollingMs ?? 250;
  return promiseProvider(makeAgentStateService(store, pollingMs));
}

/**
 * Substitutes storage while preserving the same public agent-state operations.
 * @param store - Transactional Promise storage implementation.
 * @param pollingMs - Observation interval in milliseconds.
 * @returns The agent-state provider backed by the supplied store.
 */
export function createAgentStateProviderFromStore(
  store: ReturnType<typeof createAgentStateStore>,
  pollingMs = 250,
): AgentStateProvider {
  const effects: AgentStateStoreEffects = {
    read: () => localPromise(() => store.read()),
    update: (change) => localPromise(() => store.update(change)),
  };
  return promiseProvider(makeAgentStateService(effects, pollingMs));
}

/** Local agent state operations with substitutable transactional storage. */
export class LocalAgentStateService extends Context.Service<
  LocalAgentStateService,
  AgentStateEffects
>()("@relkit/providers-local/AgentState", {
  make: (root: string, pollingMs = 250) =>
    Effect.map(makeAgentStateStore(root), (store) => makeAgentStateService(store, pollingMs)),
}) {}

/**
 * Builds the live agent-state layer without starting background work.
 * @param root - Owned state root.
 * @param pollingMs - Shared-state observation polling period.
 * @returns A layer supplying all agent operations with one initialized store.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalAgentStateService, agentStateLayer } from "./provider.js";
 *
 * const program = Effect.gen(function* () {
 *   const agents = yield* LocalAgentStateService;
 *     return yield* agents.getEpoch();
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(agentStateLayer("/tmp/example-agents"))));
 * ```
 */
export function agentStateLayer(root: string, pollingMs = 250) {
  return Layer.effect(LocalAgentStateService, LocalAgentStateService.make(root, pollingMs));
}

/**
 * Composes agent operations over a replaceable state store.
 * @param store - Effect transaction owner.
 * @param pollingMs - Observation interval in milliseconds.
 * @returns The complete agent-state service contract.
 */
export function makeAgentStateService(
  store: AgentStateStoreEffects,
  pollingMs = 250,
): AgentStateEffects {
  if (!Number.isInteger(pollingMs) || pollingMs < 50 || pollingMs > 1_000) {
    throw new RangeError("Agent-state pollingMs must be between 50 and 1000.");
  }
  const provider: AgentStateEffects = {
    getEpoch: () =>
      localOperation(
        "AgentState.getEpoch",
        Effect.map(store.read(), (state) => state.providerEpoch),
      ),
    createThread: (request) => createThread(store, request),
    listThreads: (request) => listThreads(store, request),
    loadThread: (request) =>
      Effect.gen(function* () {
        yield* recoverExpiredRun(store, request);
        yield* recoverExpiredControls(store, request);
        return yield* loadThread(store, request);
      }),
    readSnapshotHistory: (request) => readSnapshotHistory(store, request),
    ...runAndControlOperations(store, pollingMs),
    admitContinuation: (request) => admitContinuation(store, request),
    lookupContinuationReceipt: (request) => lookupContinuation(store, request),
  };
  return Object.freeze(provider);
}
