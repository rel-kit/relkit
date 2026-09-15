import type { NativeObservation, NativeRun, NativeWatchRequest, OperationContext } from "@relkit/jobs/adapter";
import type { EffectMqNativeClient } from "./native.js";

export interface EffectMqObservationOptions {
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
  readonly readTimeoutMs?: number;
}

export function observeEffectMqRun(
  get: EffectMqNativeClient["get"],
  request: NativeWatchRequest,
  context: OperationContext,
  options: EffectMqObservationOptions,
): AsyncIterable<NativeObservation> {
  return poll(get, request.runId, context, options);
}

async function* poll(
  get: EffectMqNativeClient["get"],
  runId: string,
  context: OperationContext,
  options: EffectMqObservationOptions,
): AsyncGenerator<NativeObservation> {
  const epoch = globalThis.crypto.randomUUID();
  let sequence = 0;
  let current = await read(get, runId, context, options.readTimeoutMs);
  yield frame("snapshot", current, epoch, sequence++);
  for (let count = 0; count < (options.maxPolls ?? 240) && !terminal(current); count += 1) {
    await delay(options.pollIntervalMs ?? 2_000, context.signal);
    const next = await read(get, runId, context, options.readTimeoutMs);
    if (same(current, next)) continue;
    current = next;
    yield frame("update", current, epoch, sequence++);
  }
}

function frame(kind: "snapshot" | "update", run: NativeRun, epoch: string, sequence: number): NativeObservation {
  return Object.freeze({
    kind,
    run,
    observedAt: new Date().toISOString(),
    epoch,
    sequence,
    ...(kind === "snapshot" ? { continuity: "state" as const } : {}),
  }) as NativeObservation;
}

function terminal(run: NativeRun): boolean {
  return ["completed", "failed", "cancelled", "timed-out"].includes(run.status);
}

function same(left: NativeRun, right: NativeRun): boolean {
  const a = { ...left, observedAt: undefined };
  const b = { ...right, observedAt: undefined };
  return JSON.stringify(a) === JSON.stringify(b);
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) throw new TypeError("effect-mq poll interval is invalid");
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("effect-mq observation aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function read(
  get: EffectMqNativeClient["get"],
  runId: string,
  context: OperationContext,
  timeoutMs: number | undefined,
): Promise<NativeRun> {
  if (timeoutMs === undefined) return get(runId, context);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("effect-mq read timeout is invalid");
  const controller = new AbortController();
  const abort = (): void => controller.abort(context.signal.reason ?? new Error("effect-mq observation aborted"));
  if (context.signal.aborted) abort();
  else context.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("effect-mq read timed out")), timeoutMs);
  try {
    return await get(runId, { ...context, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener("abort", abort);
  }
}
