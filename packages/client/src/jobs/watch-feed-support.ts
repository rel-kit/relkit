import type { Pending } from "./watch-feed-support.types.js";
import type { RunWatchFrame } from "@relkit/contracts/jobs";
import type { JobWatchOptions } from "./types.js";
export type { Pending } from "./watch-feed-support.types.js";

/**
 * Creates one settled-once first-snapshot Promise with explicit resolution authority.
 * @returns A settled-once Promise and its explicit settlement functions.
 */
export function deferred(): Pending {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { resolve: resolvePromise, reject: rejectPromise, promise };
}

/**
 * Calculates the existing bounded observation reconnect delay.
 * @param attempt - Existing attempt supplied by the owning operation.
 * @param options - Existing public configuration and authority.
 * @returns The bounded reconnect delay in milliseconds.
 */
export function backoff(attempt: number, options: JobWatchOptions): number {
  const minimum = Math.min(30_000, Math.max(0, options.reconnectMinDelayMs ?? 500));
  const maximum = Math.min(30_000, Math.max(minimum, options.reconnectMaxDelayMs ?? 30_000));
  const cap = Math.min(maximum, minimum * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * Math.max(1, cap - minimum + 1)) + minimum;
}

/**
 * Owns a native delay and removes its timer and borrowed abort listener on settlement.
 * @param milliseconds - Native delay in milliseconds.
 * @param signal - Borrowed caller cancellation signal.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Waits for browser online recovery while owning its listener and borrowed signal.
 * @param signal - Borrowed caller cancellation signal.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function offline(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) throw signal.reason;
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

/**
 * Adds a retained cursor only when one exists.
 * @param options - Existing public configuration and authority.
 * @param after - Retained authoritative cursor.
 * @returns Watch options retaining the supplied cursor, when present.
 */
export function withAfter(options: JobWatchOptions, after: string | undefined): JobWatchOptions {
  return after === undefined ? options : { ...options, after };
}

/**
 * Provides the existing already-completed native iterator.
 * @returns An iterator whose next pull is already complete.
 */
export function closeEmptyIterator(): AsyncIterator<unknown> {
  return { next: async () => ({ done: true, value: undefined }) };
}

/**
 * Checks the existing selective observation-frame shape.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether the existing selective frame shape is valid.
 */
export function isFrame(value: unknown): value is RunWatchFrame {
  return value !== null && typeof value === "object" && "kind" in value && "run" in value;
}

/**
 * Marks reconnect continuity without fabricating cursor or terminal evidence.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The original reset or a state-continuity reconnect frame.
 */
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

/**
 * Recognizes existing nested authorization denial envelopes.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether a supported nested authorization denial is present.
 */
export function isUnauthorized(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const record = value as {
    readonly code?: unknown;
    readonly data?: unknown;
    readonly cause?: unknown;
  };
  return (
    record.code === "RELKIT_JOB_ACCESS_DENIED" ||
    record.code === "UNAUTHORIZED" ||
    record.code === "FORBIDDEN" ||
    isUnauthorized(record.data) ||
    isUnauthorized(record.cause)
  );
}
