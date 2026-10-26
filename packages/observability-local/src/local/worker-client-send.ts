/**
 * Sends timeout-bound commands to an owned storage child and joins its close IPC.
 * Caller cancellation stops waiting; the shared worker retains sent commands
 * until their reply or deadline, so one disconnected reader cannot abort writes.
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
    const abort = () => reject(new DOMException("Telemetry request interrupted", "AbortError"));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      signal.removeEventListener("abort", abort);
      return;
    }
    // Sent work still owns its deadline and receipt, even after its caller leaves.
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
  state.closing = true;
  const deadline = setTimeout(() => {
    try {
      failWorkerClient(
        state,
        new WorkerTransportError(
          "timeout",
          "Diagnostic history flush exceeded its five-second shutdown budget; history may be incomplete.",
        ),
      );
    } finally {
      state.child.kill("SIGKILL");
    }
  }, 4000);
  try {
    if (!state.closed && !state.failure && state.opened)
      await sendWorkerCommand(state, { type: "close" });
  } finally {
    stopWorkerClient(state);
    try {
      await state.exited;
    } finally {
      clearTimeout(deadline);
    }
  }
}
