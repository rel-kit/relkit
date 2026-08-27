import type { MaybePromise } from "@relkit/contracts";
import {
  CacheCapabilityError,
  CacheIncrementUnsupportedError,
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  CacheProviderError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  type CacheCapabilities,
  type CacheCapability,
  type CacheOperation,
  type CacheOperationOutcome,
  type CacheOperationOptions,
  type CacheProvider,
} from "./client-types.js";
import type { StandardIssue, StandardSchemaV1 } from "@relkit/schema";

export function required<A>(
  value: ((...args: any[]) => MaybePromise<A>) | undefined,
  operation: CacheOperation,
): (...args: any[]) => MaybePromise<A> {
  if (value === undefined) throw new CacheProviderError(operation);
  return value;
}

export function asProvider(value: unknown): CacheProvider {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object") throw new CacheProviderError("get");
  return value as CacheProvider;
}

export function supports(
  value: CacheProvider["capabilities"],
  capability: CacheCapability,
): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.includes(capability);
  return (value as CacheCapabilities)[capability] === true;
}

export function runAbortable<A>(
  signal: AbortSignal,
  deadlineMs: number | undefined,
  work: () => MaybePromise<A>,
): Promise<A> {
  if (signal.aborted) return Promise.reject(new CacheOperationCancelledError());
  if (deadlineMs !== undefined && deadlineMs <= Date.now())
    return Promise.reject(new CacheOperationTimeoutError());
  const pending = Promise.resolve().then(work);
  return new Promise<A>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      cleanup();
      reject(new CacheOperationCancelledError());
    };
    if (deadlineMs !== undefined) {
      timer = setTimeout(
        () => {
          cleanup();
          reject(new CacheOperationTimeoutError());
        },
        Math.max(0, deadlineMs - Date.now()),
      );
    }
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

export async function validateSchema(
  schema: StandardSchemaV1 | undefined,
  value: unknown,
  phase: "key" | "value",
): Promise<unknown> {
  if (schema === undefined) return value;
  let result: Awaited<ReturnType<StandardSchemaV1["~standard"]["validate"]>>;
  try {
    result = await schema["~standard"].validate(value);
  } catch {
    throw new CacheSchemaValidationError(phase, [{ message: `Invalid cache ${phase}` }]);
  }
  if ("issues" in result && result.issues !== undefined) {
    throw new CacheSchemaValidationError(phase, freezeIssues(result.issues));
  }
  return result.value;
}

export function normalizeTtl(
  value: unknown,
  defaultTtlMs: number | undefined,
  maxTtlMs: number | undefined,
): CacheOperationOptions | undefined {
  const ttlMs = value === undefined ? defaultTtlMs : value;
  if (ttlMs === undefined) return undefined;
  if (typeof ttlMs !== "number" || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new CacheTtlPolicyError("Cache ttlMs must be a positive integer");
  }
  if (maxTtlMs !== undefined && ttlMs > maxTtlMs) {
    throw new CacheTtlPolicyError("Cache ttlMs exceeds the configured maximum");
  }
  return { ttlMs };
}

export function validatePolicy(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new CacheTtlPolicyError(`Cache ${name} must be a positive integer`);
  }
}

export function validateBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("Cache has must return a boolean");
  return value;
}

export function validateIncrementDelta(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Cache increment delta must be a finite number");
  }
  return value;
}

export function classify(value: unknown): CacheOperationOutcome {
  const name = (value as { name?: unknown })?.name;
  if (value instanceof CacheSchemaValidationError) return "validation-error";
  if (value instanceof CacheCapabilityError || value instanceof CacheIncrementUnsupportedError)
    return "unsupported";
  if (value instanceof CacheOperationCancelledError || name === "AbortError") return "cancelled";
  if (value instanceof CacheOperationTimeoutError || name === "TimeoutError") return "timeout";
  return "provider-failure";
}

export function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(Object.freeze(value));
  } catch {
    // Hooks are advisory and cannot change cache behavior.
  }
}

function freezeIssues(issues: readonly StandardIssue[]): readonly StandardIssue[] {
  return Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        message: issue.message,
        ...(issue.path === undefined ? {} : { path: Object.freeze([...issue.path]) }),
      }),
    ),
  );
}
