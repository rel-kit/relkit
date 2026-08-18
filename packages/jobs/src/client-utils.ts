import { validate, type StandardSchemaV1 } from "@zsys/schema";
import {
  JobInputValidationError,
  JobOperationCancelledError,
  JobOperationTimeoutError,
  JobProfileError,
  JobProviderError,
} from "./client.js";
import type {
  JobClientOptions,
  JobEnqueueResult,
  JobProvider,
  JobProviderResult,
} from "./client.js";

export function resolveProvider(
  source: unknown,
  profile: string,
  resolveProfile: ((profile: string) => unknown) | undefined,
): JobProvider {
  const selected = resolveProfile?.(profile) ?? profileValue(source, profile);
  if (isProvider(selected)) return selected;
  if (selected === undefined) throw new JobProfileError(profile);
  throw new JobProviderError();
}

function profileValue(source: unknown, profile: string): unknown {
  if (isProvider(source)) return source;
  const value = isRecord(source) && source.capability === "jobs" ? source.value : source;
  if (isProvider(value)) return value;
  return isRecord(value) ? value[profile] : undefined;
}

export async function parseInput(
  schema: StandardSchemaV1 | undefined,
  input: unknown,
): Promise<unknown> {
  if (schema === undefined) return input;
  const result = await validate(schema, input as never);
  if (result.issues !== undefined) throw new JobInputValidationError(result.issues);
  return result.value;
}

export function normalizeResult(
  value: JobProviderResult | undefined,
  profile: string,
  correlationId: string | undefined,
): JobEnqueueResult {
  const metadata: Record<string, any> =
    isRecord(value) && value.accepted === true && typeof value.instanceId === "string" ? value : {};
  return Object.freeze({
    ...metadata,
    instanceId:
      typeof metadata.instanceId === "string" ? metadata.instanceId : `job-${crypto.randomUUID()}`,
    accepted: true as const,
    status: "accepted" as const,
    profile,
    ...(correlationId === undefined ? {} : { correlationId }),
  });
}

export function runAbortable<A>(
  signal: AbortSignal,
  deadlineMs: number | undefined,
  work: () => Promise<A>,
): Promise<A> {
  if (signal.aborted) return Promise.reject(new JobOperationCancelledError());
  if (deadlineMs !== undefined && deadlineMs <= Date.now()) {
    return Promise.reject(new JobOperationTimeoutError());
  }
  const pending = Promise.resolve().then(work);
  return new Promise<A>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      cleanup();
      reject(new JobOperationCancelledError());
    };
    if (deadlineMs !== undefined)
      timer = setTimeout(
        () => {
          cleanup();
          reject(new JobOperationTimeoutError());
        },
        Math.max(0, deadlineMs - Date.now()),
      );
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

export function notify<T>(hook: ((value: T) => void) | undefined, value: T, enabled = true): void {
  if (!enabled) return;
  try {
    hook?.(Object.freeze(value));
  } catch {
    // Hook failures cannot change job acceptance or provider execution.
  }
}

export function resolveCorrelation(value: JobClientOptions["correlationId"]): string | undefined {
  return typeof value === "function" ? value() : value;
}

export function assertOptions(
  value: unknown,
): asserts value is { readonly correlationId?: string } {
  if (!isRecord(value)) throw new TypeError("Job enqueue options must be an object");
  assertOptionalText(value.correlationId, "correlationId");
}

export function assertOptionalText(value: unknown, name: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim() === ""))
    throw new TypeError(`Job ${name} must be non-empty text`);
}

function isProvider(value: unknown): value is JobProvider {
  return isRecord(value) && typeof value.enqueue === "function";
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
