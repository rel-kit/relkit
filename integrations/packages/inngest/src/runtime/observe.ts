import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { NativeObservation, NativeWatchRequest, OperationContext } from "@relkit/jobs/adapter";

export interface InngestObservationOptions {
  readonly get: (runId: string, context: OperationContext) => Promise<RunSnapshot>;
  readonly pollIntervalMs?: number;
  readonly readTimeoutMs?: number;
  readonly maxPolls?: number;
  readonly subscribe?: (
    runId: string,
    onSnapshot: (run: RunSnapshot) => void,
    context: OperationContext,
  ) => Promise<(() => void) | undefined>;
}

export function observeInngestRun(
  request: NativeWatchRequest,
  context: OperationContext,
  options: InngestObservationOptions,
): AsyncIterable<NativeObservation> {
  return frames(request, context, options);
}

async function* frames(
  request: NativeWatchRequest,
  context: OperationContext,
  options: InngestObservationOptions,
): AsyncGenerator<NativeObservation> {
  const epoch = globalThis.crypto.randomUUID();
  let sequence = 0;
  let current = await read(options.get, request.runId, context, options.readTimeoutMs);
  yield frame("snapshot", current, epoch, sequence++);
  if (terminal(current)) return;
  let cleanup: (() => void) | undefined;
  const realtime =
    options.subscribe === undefined
      ? undefined
      : await options
          .subscribe(
            request.runId,
            (run) => {
              current = run;
            },
            context,
          )
          .catch(() => undefined);
  cleanup = realtime;
  try {
    const maxPolls = options.maxPolls ?? 240;
    for (let poll = 0; poll < maxPolls && !terminal(current); poll += 1) {
      await delay(options.pollIntervalMs ?? 2_000, context.signal);
      const next = await read(options.get, request.runId, context, options.readTimeoutMs);
      if (sameRunState(next, current)) continue;
      current = next;
      yield frame("update", current, epoch, sequence++);
    }
  } finally {
    cleanup?.();
  }
}

function frame(
  kind: "snapshot" | "update",
  run: RunSnapshot,
  epoch: string,
  sequence: number,
): RunWatchFrame {
  return Object.freeze({
    kind,
    run,
    observedAt: new Date().toISOString(),
    epoch,
    sequence,
    ...(kind === "snapshot" ? { continuity: "state" as const } : {}),
  }) as RunWatchFrame;
}

function terminal(run: RunSnapshot): boolean {
  return (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled" ||
    run.status === "timed-out"
  );
}

function sameRunState(left: RunSnapshot, right: RunSnapshot): boolean {
  const { observedAt: _leftObservedAt, ...leftState } = left;
  const { observedAt: _rightObservedAt, ...rightState } = right;
  return JSON.stringify(leftState) === JSON.stringify(rightState);
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1)
    throw new TypeError("Inngest observation interval is invalid");
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function read(
  get: InngestObservationOptions["get"],
  runId: string,
  context: OperationContext,
  timeoutMs: number | undefined,
): Promise<RunSnapshot> {
  if (timeoutMs === undefined) return get(runId, context);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new TypeError("Inngest read timeout is invalid");
  const controller = new AbortController();
  const abort = (): void =>
    controller.abort(context.signal.reason ?? new Error("Inngest observation aborted"));
  if (context.signal.aborted) abort();
  else context.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Inngest read timed out")), timeoutMs);
  try {
    return await get(runId, { ...context, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener("abort", abort);
  }
}
