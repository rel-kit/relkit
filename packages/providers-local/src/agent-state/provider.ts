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
import { createAgentStateStore } from "./storage.js";
import { createThread, loadThread, readSnapshotHistory } from "./threads.js";
import { listThreads } from "./thread-list.js";

export interface LocalAgentStateProviderOptions {
  readonly pollingMs?: number;
}

export function createLocalAgentStateProvider(
  root: string,
  options: LocalAgentStateProviderOptions = {},
): AgentStateProvider {
  const store = createAgentStateStore(root);
  const pollingMs = options.pollingMs ?? 250;
  return createAgentStateProviderFromStore(store, pollingMs);
}

export function createAgentStateProviderFromStore(
  store: ReturnType<typeof createAgentStateStore>,
  pollingMs = 250,
): AgentStateProvider {
  if (!Number.isInteger(pollingMs) || pollingMs < 50 || pollingMs > 1_000) {
    throw new RangeError("Agent-state pollingMs must be between 50 and 1000.");
  }
  const provider: AgentStateProvider = {
    getEpoch: async () => (await store.read()).providerEpoch,
    createThread: (request) => createThread(store, request),
    listThreads: (request) => listThreads(store, request),
    loadThread: async (request) => {
      await recoverExpiredRun(store, request);
      await recoverExpiredControls(store, request);
      return loadThread(store, request);
    },
    readSnapshotHistory: (request) => readSnapshotHistory(store, request),
    acceptRun: (request) => acceptRun(store, request),
    lookupRunReceipt: (request) => lookupRunReceipt(store, request),
    readJournal: async (request) => {
      await recoverExpiredRun(store, request);
      await recoverExpiredControls(store, request);
      return readJournal(store, request);
    },
    waitForJournal: (request) => waitForJournal(store, request, pollingMs),
    claimRun: (request) => claimRun(store, request),
    renewRunClaim: (request) => renewRunClaim(store, request),
    appendJournal: (request) => appendJournal(store, request),
    completeRun: (request) => completeRun(store, request),
    suspendRun: (request) => suspendRun(store, request),
    interruptOwnedRun: (request) => interruptRun(store, request),
    acceptControl: async (request) => {
      await recoverExpiredRun(store, request);
      return acceptControl(store, request);
    },
    lookupControlReceipt: (request) => lookupControl(store, request),
    readControls: async (request) => {
      await recoverExpiredControls(store, request);
      return readControls(store, request);
    },
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
