import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import type { NativeScheduleOperations } from "../src/adapter.ts";
import type { JobsRuntime } from "../src/runtime.ts";
import { JobControlUnknownError } from "../src/control-errors.ts";
import {
  listSchedulesOperationEffect,
  ScheduleOperationFailure,
  writeScheduleOperationEffect,
} from "../src/schedule-controls-operations.ts";
test("pre-aborted schedule writes never create context or start native work", async () => {
  let contexts = 0;
  let starts = 0;
  const schedule = {
    pause: async () => {
      starts++;
      throw new Error("unexpected native start");
    },
  } as unknown as NativeScheduleOperations;
  const runtime = {
    capabilities: { service: "test", features: { schedules: true } },
    adapter: { schedules: schedule },
    operationContext: () => {
      contexts++;
      throw new Error("unexpected context creation");
    },
  } as unknown as JobsRuntime;
  const controller = new AbortController();
  controller.abort();
  const result = await Effect.runPromise(
    Effect.result(
      writeScheduleOperationEffect(
        runtime,
        schedule,
        "hourly",
        { operationId: "pause-1", signal: controller.signal },
        "pause",
      ),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(ScheduleOperationFailure);
  expect(contexts).toBe(0);
  expect(starts).toBe(0);
});
test("invalid schedule cursors fail before native reads", async () => {
  let starts = 0;
  const schedule = {
    list: async () => {
      starts++;
      return { outcome: "unavailable" };
    },
  } as unknown as NativeScheduleOperations;
  const runtime = {
    capabilities: { service: "test", features: { schedules: true } },
    adapter: { schedules: schedule },
    operationContext: ({ signal }: { signal: AbortSignal }) => ({ signal }),
  } as unknown as JobsRuntime;
  const result = await Effect.runPromise(
    Effect.result(listSchedulesOperationEffect(runtime, schedule, { cursor: "x".repeat(4097) })),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(ScheduleOperationFailure);
  expect(starts).toBe(0);
});
test("uncertain schedule writes retain the operation identity and recovery action", async () => {
  const schedule = {
    pause: async () => ({
      outcome: "unknown",
      operationId: "pause-2",
      idempotencyKey: "same-key",
      recovery: { action: "inspect-native" },
    }),
  } as unknown as NativeScheduleOperations;
  const runtime = {
    capabilities: { service: "test", features: { schedules: true } },
    adapter: { schedules: schedule },
    operationContext: ({ signal }: { signal: AbortSignal }) => ({ signal }),
  } as unknown as JobsRuntime;
  const result = await Effect.runPromise(
    Effect.result(
      writeScheduleOperationEffect(
        runtime,
        schedule,
        "hourly",
        { operationId: "pause-2" },
        "pause",
      ),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(ScheduleOperationFailure);
    expect(result.failure.cause).toBeInstanceOf(JobControlUnknownError);
  }
});
