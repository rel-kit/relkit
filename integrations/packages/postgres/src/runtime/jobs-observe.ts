/**
 * Run observation by polling: an initial snapshot frame, then an update frame
 * whenever the snapshot changes, until the run is terminal or the caller
 * aborts. Polling reads authoritative state, so no notification can be missed.
 */
import { canonicalJson } from "relkit/contracts";
import type { RunSnapshot, RunWatchFrame } from "relkit/contracts/jobs";
import type { NativeWatchRequest, OperationContext } from "relkit/jobs/adapter";

const TERMINAL = new Set(["completed", "failed", "cancelled", "timed-out"]);

/**
 * Observes one run.
 * @param get - Reads the current snapshot.
 * @param request - Run to watch.
 * @param context - Caller cancellation.
 * @param pollIntervalMs - Delay between reads.
 * @returns Snapshot and update frames.
 */
export async function* observeRun(
  get: (runId: string, context: OperationContext) => Promise<RunSnapshot>,
  request: NativeWatchRequest,
  context: OperationContext,
  pollIntervalMs: number,
): AsyncGenerator<RunWatchFrame<RunSnapshot>> {
  const epoch = `postgres:${request.runId}`;
  let sequence = 0;
  let run = await get(request.runId, context);
  let previous = canonicalJson({ ...run, observedAt: "" });
  yield {
    kind: "snapshot",
    run,
    observedAt: run.observedAt,
    epoch,
    sequence: ++sequence,
    continuity: "state",
  };
  while (!TERMINAL.has(run.status) && !context.signal.aborted) {
    await delay(pollIntervalMs, context.signal);
    if (context.signal.aborted) return;
    run = await get(request.runId, context);
    const current = canonicalJson({ ...run, observedAt: "" });
    if (current === previous) continue;
    previous = current;
    yield { kind: "update", run, observedAt: run.observedAt, epoch, sequence: ++sequence };
  }
}

/**
 * Waits, returning early when aborted.
 * @param milliseconds - Delay.
 * @param signal - Caller cancellation.
 * @returns A Promise resolving after the delay or abort.
 */
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
