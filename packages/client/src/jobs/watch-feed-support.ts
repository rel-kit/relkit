import type { RunWatchFrame } from "@relkit/contracts/jobs";
import type { JobWatchOptions } from "./types.js";

export type Pending = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};

export function deferred(): Pending {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { resolve: resolvePromise, reject: rejectPromise, promise };
}

export function backoff(attempt: number, options: JobWatchOptions): number {
  const minimum = Math.min(30_000, Math.max(0, options.reconnectMinDelayMs ?? 500));
  const maximum = Math.min(30_000, Math.max(minimum, options.reconnectMaxDelayMs ?? 30_000));
  const cap = Math.min(maximum, minimum * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * Math.max(1, cap - minimum + 1)) + minimum;
}

export function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
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

export async function offline(signal: AbortSignal): Promise<boolean> {
  const navigatorValue = (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator;
  if (navigatorValue?.onLine !== false) return false;
  await new Promise<void>((resolve, reject) => {
    const online = (): void => {
      cleanup();
      resolve();
    };
    const onAbort = (): void => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = (): void => {
      globalThis.removeEventListener?.("online", online);
      signal.removeEventListener("abort", onAbort);
    };
    globalThis.addEventListener?.("online", online, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return true;
}

export function withAfter(options: JobWatchOptions, after: string | undefined): JobWatchOptions {
  return after === undefined ? options : { ...options, after };
}

export function closeEmptyIterator(): AsyncIterator<unknown> {
  return { next: async () => ({ done: true, value: undefined }) };
}

export function isFrame(value: unknown): value is RunWatchFrame {
  return value !== null && typeof value === "object" && "kind" in value && "run" in value;
}

export function resetFrame(value: unknown): unknown {
  if (!isFrame(value) || value.kind === "reset") return value;
  return {
    kind: "reset",
    run: value.run,
    observedAt: value.observedAt,
    epoch: value.epoch,
    sequence: value.sequence,
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
    reason: "reconnected",
  } satisfies RunWatchFrame;
}

export function isUnauthorized(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const record = value as { readonly code?: unknown; readonly data?: unknown; readonly cause?: unknown };
  return (
    record.code === "RELKIT_JOB_ACCESS_DENIED" ||
    record.code === "UNAUTHORIZED" ||
    record.code === "FORBIDDEN" ||
    isUnauthorized(record.data) ||
    isUnauthorized(record.cause)
  );
}
