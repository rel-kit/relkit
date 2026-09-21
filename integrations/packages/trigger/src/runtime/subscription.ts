import type {
  NativeObservation,
  NativeRun,
  NativeWatchRequest,
  OperationContext,
} from "@relkit/jobs/adapter";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { TriggerNativeClient } from "./native.js";
import { record, triggerSnapshot } from "./sdk-mapping.js";

export async function* observeTriggerRun(
  request: NativeWatchRequest,
  context: OperationContext,
  client: TriggerNativeClient,
  options: TriggerObservationOptions = {},
): AsyncGenerator<NativeObservation> {
  const first = await read(client.get, request.runId, context, options.readTimeoutMs);
  const epoch = globalThis.crypto.randomUUID();
  let sequence = 0;
  let version = 0;
  ensureScope(first, context);
  yield frame("snapshot", first, epoch, sequence++);
  if (terminal(first)) return;
  const subscription = await client.subscribeToRun?.(request.runId, context, request.after);
  if (subscription === undefined) {
    yield* pollTriggerRun(request.runId, context, client, first, epoch, sequence, options);
    return;
  }
  try {
    for await (const raw of subscription.stream) {
      const nextVersion = rawVersion(raw);
      if (nextVersion !== undefined && nextVersion <= version) continue;
      if (nextVersion !== undefined) version = nextVersion;
      const run = rawRun(raw, context);
      ensureScope(run, context);
      yield frame("update", run, epoch, sequence++);
      if (terminal(run)) return;
    }
  } finally {
    await subscription.unsubscribe?.();
  }
}

export interface TriggerObservationOptions {
  readonly pollIntervalMs?: number;
  readonly readTimeoutMs?: number;
  readonly maxPolls?: number;
}

async function* pollTriggerRun(
  runId: string,
  context: OperationContext,
  client: TriggerNativeClient,
  initial: NativeRun,
  epoch: string,
  sequence: number,
  options: TriggerObservationOptions,
): AsyncGenerator<NativeObservation> {
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxPolls = options.maxPolls ?? 240;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1)
    throw new TypeError("Trigger poll interval is invalid");
  if (!Number.isSafeInteger(maxPolls) || maxPolls < 1)
    throw new TypeError("Trigger maxPolls is invalid");
  let current = initial;
  let nextSequence = sequence;
  for (let count = 0; count < maxPolls && !terminal(current); count += 1) {
    await delay(pollIntervalMs, context.signal);
    const next = await read(client.get, runId, context, options.readTimeoutMs);
    ensureScope(next, context);
    if (!sameRun(current, next)) {
      current = next;
      yield frame("update", current, epoch, nextSequence++);
    }
  }
}

function frame(
  kind: "snapshot" | "update",
  run: RunSnapshot,
  epoch: string,
  sequence: number,
): NativeObservation {
  return Object.freeze({
    kind,
    run,
    observedAt: new Date().toISOString(),
    epoch,
    sequence,
    ...(kind === "snapshot" ? { continuity: "state" as const } : {}),
  }) as NativeObservation;
}

function rawRun(value: unknown, context: OperationContext): NativeRun {
  const record = asRecord(value);
  const run = asRecord(record?.run) ?? record;
  if (run === undefined || typeof run.status !== "string")
    throw new TypeError("Trigger subscription frame is invalid");
  if (typeof run.runId === "string") return run as NativeRun;
  if (typeof run.id !== "string") throw new TypeError("Trigger subscription frame is invalid");
  return triggerSnapshot(run, context);
}

function rawVersion(value: unknown): number | undefined {
  const record = asRecord(value);
  return typeof record?.version === "number" && Number.isSafeInteger(record.version)
    ? record.version
    : undefined;
}

function ensureScope(run: NativeRun, context: OperationContext): void {
  if (run.scope !== undefined && run.scope !== context.scope)
    throw new Error("RELKIT_TRIGGER_SCOPE_MISMATCH");
}

function terminal(run: NativeRun): boolean {
  return ["completed", "failed", "cancelled", "timed-out"].includes(run.status);
}

function sameRun(left: NativeRun, right: NativeRun): boolean {
  const a = { ...left, observedAt: undefined };
  const b = { ...right, observedAt: undefined };
  return JSON.stringify(a) === JSON.stringify(b);
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Trigger observation aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function read(
  get: TriggerNativeClient["get"],
  runId: string,
  context: OperationContext,
  timeoutMs: number | undefined,
): Promise<NativeRun> {
  if (timeoutMs === undefined) return get(runId, context);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new TypeError("Trigger read timeout is invalid");
  const controller = new AbortController();
  const abort = (): void =>
    controller.abort(context.signal.reason ?? new Error("Trigger observation aborted"));
  if (context.signal.aborted) abort();
  else context.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Trigger read timed out")), timeoutMs);
  try {
    return await get(runId, { ...context, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener("abort", abort);
  }
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}
