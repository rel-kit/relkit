/** Shared submissions, contexts and executors for the Postgres jobs suites. */
import type { JsonValue } from "relkit/contracts";
import type {
  NativeSubmission,
  OperationContext,
  TaskExecutionEnvelope,
  TaskExecutor,
} from "relkit/jobs/adapter";

/**
 * Builds an operation context for a service.
 * @param service - Jobs service.
 * @returns A context with a live signal.
 */
export function contextFor(service = "postgres"): OperationContext {
  return {
    signal: new AbortController().signal,
    application: "test",
    environment: "test",
    scope: "default",
    service,
    serviceGeneration: "generation.test",
  };
}

/**
 * Builds a task submission.
 * @param value - Input value.
 * @param extra - Overrides such as an idempotency key or retry policy.
 * @returns The submission.
 */
export function submission(
  value: JsonValue,
  extra: Partial<NativeSubmission> = {},
): NativeSubmission {
  return {
    jobId: "jobs.send",
    taskId: "tasks.send",
    taskVersion: "1",
    buildId: "build.test",
    input: value,
    canonicalInput: { version: 1, kind: "json", value },
    operationId: `op-${crypto.randomUUID()}`,
    ...extra,
  };
}

/** Retry policy with three quick attempts. */
export const threeAttempts: JsonValue = {
  retry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 10, multiplier: 1, jitter: "none" },
};

/**
 * Executor that records every attempt and runs a handler.
 * @param handler - Behavior per envelope; return the output or throw.
 * @returns The executor and its call log.
 */
export function recordingExecutor(
  handler: (envelope: TaskExecutionEnvelope) => Promise<JsonValue> | JsonValue = () => "done",
): { readonly executor: TaskExecutor; readonly calls: TaskExecutionEnvelope[] } {
  const calls: TaskExecutionEnvelope[] = [];
  return {
    calls,
    executor: {
      execute: async (envelope) => {
        calls.push(envelope);
        return handler(envelope);
      },
    },
  };
}

/**
 * Polls until a predicate holds.
 * @param check - Predicate.
 * @param timeoutMs - Deadline.
 * @returns When the predicate holds; throws on timeout.
 */
export async function eventually(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(25);
  }
  throw new Error("Condition was not met in time");
}
