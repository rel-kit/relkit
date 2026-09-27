import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { JobControlUnknownError } from "../src/control-errors.ts";
import {
  cancelRunOperationEffect,
  cancelRunValue,
  ControlOperationFailure,
  retryRunValue,
} from "../src/controls-write-operations.ts";
import type { JobsRuntime } from "../src/runtime.ts";

test("pre-aborted cancellation does not build context or start provider work", async () => {
  let contexts = 0;
  let starts = 0;
  const runtime = {
    capabilities: { service: "test", features: { cancel: true } },
    adapter: {
      cancel: async () => {
        starts++;
        throw new Error("unexpected provider start");
      },
    },
    operationContext: () => {
      contexts++;
      throw new Error("unexpected context creation");
    },
  } as unknown as JobsRuntime;
  const controller = new AbortController();
  controller.abort();
  const result = await Effect.runPromise(
    Effect.result(
      cancelRunOperationEffect(runtime, "run", {
        operationId: "cancel-1",
        signal: controller.signal,
      }),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(ControlOperationFailure);
  expect(contexts).toBe(0);
  expect(starts).toBe(0);
});

test("retry compatibility preserves pinned input and creates a new run", async () => {
  let retryRequest: Record<string, unknown> | undefined;
  const runtime = {
    capabilities: { service: "test", features: { read: true, retry: true } },
    adapter: {
      get: async () => ({
        runId: "old",
        jobId: "job",
        taskId: "task",
        taskVersion: "1",
        buildId: "build",
        inputHash: "sha256:input",
      }),
      retry: async (request: Record<string, unknown>) => {
        retryRequest = request;
        return {
          accepted: true,
          runId: "new",
          jobId: "job",
          taskId: "task",
          taskVersion: "1",
          acceptedAt: "2026-01-01T00:00:00.000Z",
          retryOfRunId: "old",
        };
      },
    },
    operationContext: ({ signal }: { signal: AbortSignal }) => ({ signal }),
  } as unknown as JobsRuntime;
  const receipt = await retryRunValue(runtime, "old", { operationId: "retry-1" });
  expect(receipt.runId).toBe("new");
  expect(retryRequest).toMatchObject({
    inputHash: "sha256:input",
    canonicalAdmission: { validatePinnedInput: true, clearInitialDelay: true },
  });
});

test("uncertain native cancellation retains the recovery identity", async () => {
  const runtime = {
    capabilities: { service: "test", features: { cancel: true } },
    adapter: {
      cancel: async () => ({
        outcome: "unknown",
        operationId: "cancel-2",
        idempotencyKey: "same-key",
        recovery: { action: "inspect-native" },
      }),
    },
    operationContext: ({ signal }: { signal: AbortSignal }) => ({ signal }),
  } as unknown as JobsRuntime;
  const result = await Effect.runPromise(
    Effect.result(cancelRunOperationEffect(runtime, "run", { operationId: "cancel-2" })),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(ControlOperationFailure);
    expect(result.failure.cause).toBeInstanceOf(JobControlUnknownError);
  }
  await expect(cancelRunValue(runtime, "run", { operationId: "cancel-2" })).rejects.toThrow(
    JobControlUnknownError,
  );
});
