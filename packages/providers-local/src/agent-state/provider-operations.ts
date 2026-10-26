/** Binds run and control operations with recovery ordering and projects the public Promise interface. */
import { recoverControl } from "./control-claim-recovery.js";
import { Effect } from "effect";
import { runLocal } from "../local-effect.js";
import type { AgentStateEffects } from "./provider.types.js";
import type { AgentStateStoreEffects } from "./storage.js";
import type { AgentStateProvider } from "@relkit/contracts";
import { acceptControl, lookupControl, readControls, waitForControls } from "./controls.js";
import { claimControl, markEffect, renewControlClaim, settleControl } from "./control-lifecycle.js";
import { readJournal, waitForJournal } from "./journal.js";
import { recoverExpiredControls } from "./control-recovery.js";
import { claimRun, renewRunClaim } from "./run-claims.js";
import { completeRun } from "./run-completion.js";
import { interruptRun } from "./run-interruption.js";
import { appendJournal } from "./run-journal-write.js";
import { suspendRun } from "./run-suspension.js";
import { acceptRun, lookupRunReceipt } from "./runs.js";
import { recoverExpiredRun } from "./run-recovery.js";

/**
 * Projects the existing Promise interface at the framework boundary.
 * @param service - The once-built owning service.
 * @returns Public methods that preserve rejection identities and AbortSignals.
 */
export function promiseProvider(service: AgentStateEffects): AgentStateProvider {
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

/**
 * Binds run and control operations with their original recovery ordering.
 * @param store - Owning transactional state operations shared by all bound methods.
 * @param pollingMs - Validated observation interval in milliseconds.
 * @returns Run and control Effect methods retaining the provider recovery ordering; no work starts until execution.
 */
export function runAndControlOperations(
  store: AgentStateStoreEffects,
  pollingMs: number,
): Omit<
  AgentStateEffects,
  | "getEpoch"
  | "createThread"
  | "listThreads"
  | "loadThread"
  | "readSnapshotHistory"
  | "admitContinuation"
  | "lookupContinuationReceipt"
> {
  return {
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
  };
}
