/**
 * Sends timeout-bound commands to an owned storage child and joins its close IPC.
 * Cancellation rejects pending callers and terminates that child's transport.
 */
import type { Schema } from "effect";
import { WorkerTransportError } from "@relkit/observability/local/worker-contract";
import type { LocalWorkerCommand } from "@relkit/observability/local/record";
import type { WorkerClientState, PendingWorkerCall } from "./worker-client-state.types.js";
import { failWorkerClient, stopWorkerClient } from "./worker-client-state.js";

/** @param state - Child authority. @param command - Existing wire command. @param signal - Call cancellation. @returns Decoded reply after the worker acknowledges. */
export function sendWorkerCommand(
  state: WorkerClientState,
  command: LocalWorkerCommand,
  signal?: AbortSignal,
): Promise<Schema.Json | undefined> {
  if (state.failure || state.closed)
    return Promise.reject(state.failure ?? new Error("Telemetry worker is closed"));
  return new Promise((resolve, reject) => {
    const id = ++state.nextId;
    const abort = () => failWorkerClient(state, new Error("Telemetry worker interrupted"));
    if (signal?.aborted) {
      abort();
      reject(state.failure);
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      reject(state.failure);
      return;
    }
    const timer = setTimeout(
      () =>
        failWorkerClient(
          state,
          new WorkerTransportError("timeout", "Telemetry worker timed out; restart dev to recover"),
        ),
      command.type === "open" ? 120_000 : 15_000,
    );
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const pending: PendingWorkerCall = {
      timer,
      resolve: (value) => {
        cleanup();
        if (command.type === "open") state.opened = true;
        resolve(value);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    };
    state.pending.set(id, pending);
    sendEnvelope(state, id, command);
  });
}

/** @param state - Child authority. @param id - Pending identity. @param command - Wire command. @returns Nothing; send failure settles the pending owner. */
function sendEnvelope(state: WorkerClientState, id: number, command: LocalWorkerCommand): void {
  try {
    state.child.send({ id, command }, (error) => {
      if (error) failWorkerClient(state, new WorkerTransportError("send", error.message));
    });
  } catch (cause) {
    failWorkerClient(
      state,
      new WorkerTransportError("send", cause instanceof Error ? cause.message : String(cause)),
    );
  }
}

/** @param state - Owned worker. @returns The single close acknowledgement followed by physical termination. */
export function closeWorkerClient(state: WorkerClientState): Promise<void> {
  state.closePromise ??= closeOnce(state);
  return state.closePromise;
}

/** @param state - Owned worker. @returns Completion after the worker close command or failure. */
async function closeOnce(state: WorkerClientState): Promise<void> {
  if (state.closed) return;
  state.closing = true;
  try {
    if (!state.failure && state.opened) await sendWorkerCommand(state, { type: "close" });
  } finally {
    stopWorkerClient(state);
  }
}
