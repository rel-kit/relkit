/** Keeps expected agent-state read validation in the typed failure channel and preserves Promise errors. */
import { Effect } from "effect";
import { expect, test } from "vitest";
import { lookupContinuation } from "../../src/agent-state/continuations.js";
import { lookupRunReceipt } from "../../src/agent-state/runs.js";
import { lookupControl, readControls } from "../../src/agent-state/controls.js";
import { readJournal } from "../../src/agent-state/journal.js";
import { recoverExpiredControls } from "../../src/agent-state/control-recovery.js";
import { recoverExpiredRun } from "../../src/agent-state/run-recovery.js";
import { readSnapshotHistory } from "../../src/agent-state/threads.js";
import { emptyAgentState } from "../../src/agent-state/state.js";
import type { AgentStateStoreEffects } from "../../src/agent-state/storage.js";
import { runLocal } from "../../src/local-effect.js";
import { baseScope, operationId } from "../agent-state/identity.js";

const state = emptyAgentState();
const request = { ...baseScope(state.providerEpoch), threadId: "missing" };
const receipt = {
  ...request,
  operationId: operationId(1),
  semanticDigest: "missing-thread",
  now: new Date().toISOString(),
};
const store: AgentStateStoreEffects = {
  read: () => Effect.succeed(state),
  update: () => Effect.die(new Error("Read validation must not mutate state")),
};
const cases = {
  continuation: lookupContinuation(store, receipt).pipe(Effect.asVoid),
  run: lookupRunReceipt(store, receipt).pipe(Effect.asVoid),
  control: lookupControl(store, { ...receipt, runId: "run" }).pipe(Effect.asVoid),
  controls: readControls(store, { ...request, runId: "run", limit: 1 }).pipe(Effect.asVoid),
  journal: readJournal(store, {
    ...request,
    after: { ...request, sequence: "0" },
    limit: 1,
    maxEncodedBytes: 1024,
  }).pipe(Effect.asVoid),
  controlRecovery: recoverExpiredControls(store, request).pipe(Effect.asVoid),
  runRecovery: recoverExpiredRun(store, request).pipe(Effect.asVoid),
  history: readSnapshotHistory(store, {
    ...request,
    snapshotId: "snapshot",
    cursor: "0",
    maxEncodedBytes: 1024,
  }).pipe(Effect.asVoid),
};

for (const [name, effect] of Object.entries(cases)) {
  test(`${name} keeps missing ownership typed and preserves its public error`, async () => {
    const result = await Effect.runPromiseExit(Effect.result(effect));
    expect(result).toMatchObject({
      _tag: "Success",
      value: {
        _tag: "Failure",
        failure: { _tag: "LocalOperationError", cause: { code: "NOT_FOUND" } },
      },
    });
    await expect(runLocal(effect)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
}
