import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { defineJob, defineJobEffect, LegacyJobValidationError } from "../src/legacy-define-job.ts";
const input = z.object({ id: z.string() });
const target = defineFunction({
  id: "orders.execute",
  input,
  output: z.string(),
  handler: async ({ id }) => id,
});
const retry = {
  maxAttempts: 2,
  initialDelayMs: 0,
  maxDelayMs: 1_000,
  multiplier: 2,
  jitter: "none" as const,
};
const options = { id: "orders.job", input, target, retry };
test("legacy job descriptor is frozen in Effect and the sync API", async () => {
  const job = await Effect.runPromise(defineJobEffect(options));
  expect(job.id).toBe("orders.job");
  expect(job.retry.maxAttempts).toBe(2);
  expect(Object.isFrozen(job)).toBe(true);
  expect(defineJob(options).id).toBe(job.id);
});
test("invalid legacy retry fails with a tagged Effect error", async () => {
  const invalid = { ...options, retry: { ...retry, maxAttempts: 0 } };
  const result = await Effect.runPromise(Effect.result(defineJobEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(LegacyJobValidationError);
    expect(result.failure.reason).toContain("positive integer");
  }
  expect(() => defineJob(invalid)).toThrow(TypeError);
});
test("legacy jobs retain bounded schedules and idempotency policy", async () => {
  const authored = {
    ...options,
    profile: "primary",
    timeoutMs: 5_000,
    concurrency: 2,
    schedule: [
      {
        id: "hourly",
        cron: "0 * * * *",
        timezone: "UTC",
        input: { id: "one" },
        overlap: "skip" as const,
      },
    ],
    idempotency: { key: "id", retentionMs: 60_000 },
  };
  const job = await Effect.runPromise(defineJobEffect(authored));
  expect(job).toMatchObject({
    profile: "primary",
    timeoutMs: 5_000,
    concurrency: 2,
    idempotency: { key: "id", retentionMs: 60_000 },
    schedule: [{ id: "hourly", overlap: "skip" }],
  });
  expect(Object.isFrozen(job.schedule)).toBe(true);
});
test.each([
  [{ handler: () => {} }, "Jobs cannot own handlers"],
  [{ input: null }, "Job input"],
  [{ target: null }, "Job target"],
  [{ timeoutMs: 0 }, "timeoutMs"],
  [{ concurrency: 0 }, "concurrency"],
  [{ schedule: {} }, "schedules must be an array"],
  [{ schedule: [null] }, "schedule must be an object"],
  [
    { schedule: [{ id: "hourly", cron: "0 * * * *", timezone: "UTC", input: {}, overlap: "bad" }] },
    "schedule.overlap",
  ],
  [
    { schedule: [{ id: "hourly", cron: " ", timezone: "UTC", input: {}, overlap: "skip" }] },
    "schedule.cron",
  ],
  [{ idempotency: {} }, "idempotency.key"],
  [{ idempotency: { key: "id", retentionMs: 0 } }, "idempotency.retentionMs"],
] as const)("rejects invalid legacy job option %j", async (override, message) => {
  const invalid = { ...options, ...override } as never;
  const result = await Effect.runPromise(Effect.result(defineJobEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(LegacyJobValidationError);
    expect(result.failure.reason).toContain(message);
  }
  expect(() => defineJob(invalid)).toThrow(message);
});
test("rejects duplicate schedule identities", () => {
  const schedule = { id: "hourly", cron: "0 * * * *", timezone: "UTC", input: {}, overlap: "skip" };
  expect(() => defineJob({ ...options, schedule: [schedule, schedule] } as never)).toThrow(
    'Duplicate job schedule "hourly"',
  );
});
