import type { MaybePromise } from "@zsys/contracts";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  BucketProviderError,
  type BucketCapability,
  type BucketOperation,
  type BucketOperationOutcome,
  type BucketObjectMetadata,
  type BucketProvider,
} from "./client-types.js";

export function required<A>(
  value: ((...args: any[]) => MaybePromise<A>) | undefined,
  operation: BucketOperation,
): (...args: any[]) => MaybePromise<A> {
  if (value === undefined) throw new BucketProviderError(operation);
  return value;
}
export function asProvider(value: unknown): BucketProvider {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object") throw new BucketProviderError("put");
  return value as BucketProvider;
}
export function supports(
  value: BucketProvider["capabilities"],
  capability: BucketCapability,
): boolean {
  if (Array.isArray(value)) return value.includes(capability);
  return (
    (value as import("./client-types.js").BucketCapabilities | undefined)?.[capability] === true
  );
}
export function runAbortable<A>(
  signal: AbortSignal,
  deadlineMs: number | undefined,
  work: () => MaybePromise<A>,
): Promise<A> {
  if (signal.aborted) return Promise.reject(new BucketOperationCancelledError());
  if (deadlineMs !== undefined && deadlineMs <= Date.now())
    return Promise.reject(new BucketOperationTimeoutError());
  const pending = Promise.resolve().then(work);
  return new Promise<A>((resolve, reject) => {
    const timer =
      deadlineMs === undefined
        ? undefined
        : setTimeout(
            () => {
              cleanup();
              reject(new BucketOperationTimeoutError());
            },
            Math.max(0, deadlineMs - Date.now()),
          );
    const abort = () => {
      cleanup();
      reject(new BucketOperationCancelledError());
    };
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (cause) => {
        cleanup();
        reject(cause);
      },
    );
  });
}
export function classify(value: unknown): BucketOperationOutcome {
  const name = (value as { name?: unknown })?.name;
  if (value instanceof BucketOperationCancelledError || name === "AbortError") return "cancelled";
  if (value instanceof BucketOperationTimeoutError || name === "TimeoutError") return "timeout";
  return "provider-failure";
}
export function validateBytes(value: Uint8Array | undefined): Uint8Array | undefined {
  if (value !== undefined && !(value instanceof Uint8Array))
    throw new TypeError("Bucket get must return bytes or undefined");
  return value;
}
export function validateMetadata(
  value: BucketObjectMetadata | undefined,
): BucketObjectMetadata | undefined {
  if (value !== undefined && (value === null || typeof value !== "object"))
    throw new TypeError("Bucket head must return metadata or undefined");
  return value;
}
export function validateBoolean(value: boolean): boolean {
  if (typeof value !== "boolean") throw new TypeError("Bucket exists must return a boolean");
  return value;
}
export function validateKeys(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || !value.every((key) => typeof key === "string"))
    throw new TypeError("Bucket list must return string keys");
  return value;
}
export function validateText(value: string): string {
  if (typeof value !== "string") throw new TypeError("Bucket URL must be a string");
  return value;
}
export function assertKey(value: string): void {
  if (typeof value !== "string") throw new TypeError("Bucket key must be a string");
}
export function assertText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`Bucket ${name} must be non-empty`);
}
export function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(Object.freeze(value));
  } catch {
    // Hooks are advisory and cannot change provider behavior.
  }
}
