import { Context, Effect, Layer } from "effect";
import { localOperation, localPromise, runLocal, runLocalSync } from "../local-effect.js";
import type { AgentStateEffects, LocalAgentStateProviderOptions } from "./provider.types.js";
import type { AgentStateStoreEffects } from "./storage.js";
import type { AgentStateProvider } from "@relkit/agents";
import { acceptControl, lookupControl, readControls, waitForControls } from "./controls.js";
import {
  claimControl,
  markEffect,
  recoverControl,
  renewControlClaim,
  settleControl,
} from "./control-lifecycle.js";
import { admitContinuation, lookupContinuation } from "./continuations.js";
import { readJournal, waitForJournal } from "./journal.js";
import { recoverExpiredControls } from "./control-recovery.js";
import { claimRun, renewRunClaim } from "./run-claims.js";
import { completeRun, interruptRun } from "./run-completion.js";
import { appendJournal } from "./run-journal-write.js";
import { suspendRun } from "./run-suspension.js";
import { acceptRun, lookupRunReceipt } from "./runs.js";
import { recoverExpiredRun } from "./run-recovery.js";
import { createAgentStateStore, makeAgentStateStore } from "./storage.js";
import { createThread, loadThread, readSnapshotHistory } from "./threads.js";
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
>()("@relkit/providers-local/AgentState") {}

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
  return Layer.effect(
    LocalAgentStateService,
    Effect.map(makeAgentStateStore(root), (store) => makeAgentStateService(store, pollingMs)),
  );
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
    acceptRun: (request) => acceptRun(store, request),
    lookupRunReceipt: (request) => lookupRunReceipt(store, request),
    readJournal: (request) =>
      Effect.gen(function* () {
        yield* recoverExpiredRun(store, request);
        yield* recoverExpiredControls(store, request);
        return yield* readJournal(store, request);
      }),
    waitForJournal: (request) => waitForJournal(store, request, pollingMs),
    claimRun: (request) => claimRun(store, request),
    renewRunClaim: (request) => renewRunClaim(store, request),
    appendJournal: (request) => appendJournal(store, request),
    completeRun: (request) => completeRun(store, request),
    suspendRun: (request) => suspendRun(store, request),
    interruptOwnedRun: (request) => interruptRun(store, request),
    acceptControl: (request) =>
      Effect.gen(function* () {
        yield* recoverExpiredRun(store, request);
        return yield* acceptControl(store, request);
      }),
    lookupControlReceipt: (request) => lookupControl(store, request),
    readControls: (request) =>
      Effect.gen(function* () {
        yield* recoverExpiredControls(store, request);
        return yield* readControls(store, request);
      }),
    waitForControls: (request) => waitForControls(store, request, pollingMs),
    claimControl: (request) => claimControl(store, request),
    renewControlClaim: (request) => renewControlClaim(store, request),
    markControlEffectStarted: (request) => markEffect(store, request),
    settleControl: (request) => settleControl(store, request),
    recoverAbandonedControl: (request) => recoverControl(store, request),
    admitContinuation: (request) => admitContinuation(store, request),
    lookupContinuationReceipt: (request) => lookupContinuation(store, request),
  };
  return Object.freeze(provider);
}

/**
 * Projects the existing Promise interface at the framework boundary.
 * @param service - The once-built owning service.
 * @returns Public methods that preserve rejection identities and AbortSignals.
 */
function promiseProvider(service: AgentStateEffects): AgentStateProvider {
  return {
    getEpoch: () => runLocal(service.getEpoch()),
    createThread: (request) => runLocal(service.createThread(request)),
    listThreads: (request) => runLocal(service.listThreads(request)),
    loadThread: (request) => runLocal(service.loadThread(request)),
    readSnapshotHistory: (request) => runLocal(service.readSnapshotHistory(request)),
    acceptRun: (request) => runLocal(service.acceptRun(request)),
    lookupRunReceipt: (request) => runLocal(service.lookupRunReceipt(request)),
    readJournal: (request) => runLocal(service.readJournal(request)),
    waitForJournal: (request) => runLocal(service.waitForJournal(request), request.signal),
    claimRun: (request) => runLocal(service.claimRun(request)),
    renewRunClaim: (request) => runLocal(service.renewRunClaim(request)),
    appendJournal: (request) => runLocal(service.appendJournal(request)),
    completeRun: (request) => runLocal(service.completeRun(request)),
    suspendRun: (request) => runLocal(service.suspendRun(request)),
    interruptOwnedRun: (request) => runLocal(service.interruptOwnedRun(request)),
    acceptControl: (request) => runLocal(service.acceptControl(request)),
    lookupControlReceipt: (request) => runLocal(service.lookupControlReceipt(request)),
    readControls: (request) => runLocal(service.readControls(request)),
    waitForControls: (request) => runLocal(service.waitForControls(request), request.signal),
    claimControl: (request) => runLocal(service.claimControl(request)),
    renewControlClaim: (request) => runLocal(service.renewControlClaim(request)),
    markControlEffectStarted: (request) => runLocal(service.markControlEffectStarted(request)),
    settleControl: (request) => runLocal(service.settleControl(request)),
    recoverAbandonedControl: (request) => runLocal(service.recoverAbandonedControl(request)),
    admitContinuation: (request) => runLocal(service.admitContinuation(request)),
    lookupContinuationReceipt: (request) => runLocal(service.lookupContinuationReceipt(request)),
  };
}
