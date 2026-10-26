/**
 * Registers IPC reply/exit handlers for one isolated storage worker.
 * Invalid replies fail pending callers; stopping affects only the owned child.
 */
import { Schema } from "effect";
import { ObservabilityQueryError } from "@relkit/observability";
import { WorkerTransportError } from "@relkit/observability/local/worker-contract";
import type { ChildProcess } from "node:child_process";
import type { WorkerClientState } from "./worker-client-state.types.js";

const responseSchema = Schema.Struct({
  id: Schema.Number,
  fatal: Schema.optionalKey(Schema.Boolean),
  value: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(Schema.String),
  code: Schema.optionalKey(
    Schema.Literals([
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    ]),
  ),
});

/** @param child - Owned IPC child. @param onFailure - First terminal failure observer. @returns Registered process state. */
export function createWorkerClientState(
  child: ChildProcess,
  onFailure: (error: Error) => void,
): WorkerClientState {
  const state: WorkerClientState = {
    child,
    onFailure,
    exited: new Promise((resolve) => child.once("close", () => resolve())),
    pending: new Map(),
    nextId: 0,
    closed: false,
    closing: false,
    opened: false,
    failure: undefined,
    diagnostic: "",
    closePromise: undefined,
  };
  child.stderr?.on("data", (value: Buffer) => {
    state.diagnostic = `${state.diagnostic}${value.toString()}`.slice(-8192);
  });
  child.on("error", (error) => failWorkerClient(state, error));
  child.on("exit", (code) => {
    if (!state.closed && (!state.closing || state.pending.size > 0))
      failWorkerClient(state, new Error(`Telemetry worker exited (${code}): ${state.diagnostic}`));
  });
  child.on("message", (input) => {
    try {
      receiveWorkerReply(state, Schema.decodeUnknownSync(responseSchema)(input));
    } catch (cause) {
      failWorkerClient(state, new Error("Invalid telemetry worker response", { cause }));
    }
  });
  return state;
}

/** @param state - Owned child state. @returns Nothing after idempotent child termination. */
export function stopWorkerClient(state: WorkerClientState): void {
  if (state.closed) return;
  state.closed = true;
  state.child.kill();
}

/** @param state - Owned IPC state. @param error - Terminal diagnostic. @returns Nothing after settling pending calls and stopping the child. */
export function failWorkerClient(state: WorkerClientState, error: Error): void {
  if (state.failure) return;
  state.failure = error;
  for (const item of state.pending.values()) {
    clearTimeout(item.timer);
    item.reject(error);
  }
  state.pending.clear();
  try {
    if (!state.closed) state.onFailure(error);
  } finally {
    stopWorkerClient(state);
  }
}

/** @param state - Pending owner. @param message - Decoded IPC reply. @returns Nothing after settling its exact pending identity. */
function receiveWorkerReply(state: WorkerClientState, message: typeof responseSchema.Type): void {
  if (message.fatal) {
    failWorkerClient(
      state,
      new Error(message.error ?? "Telemetry worker failed; restart dev to recover"),
    );
    return;
  }
  const item = state.pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  state.pending.delete(message.id);
  if (!message.error) {
    item.resolve(message.value);
    return;
  }
  if (message.code) item.reject(new ObservabilityQueryError(message.code, message.error));
  else item.reject(new WorkerTransportError("response", message.error));
}
