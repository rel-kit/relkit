import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  copyConcurrency,
  copyResources,
  copyTriggerOptions,
  defineJob,
  defineTask,
  durationToMillis,
  isRfc3339Instant,
  memoryBytes,
  validateResultOptions,
} from "./src/index.ts";
import { copyAdmission } from "./src/job-validation.ts";
import { copySchedules } from "./src/schedule-validation.ts";
import { normalizeRetry } from "./src/task-validation.ts";

test("accepts only exact readable duration boundaries", () => {
  const valid: readonly [string, number][] = [
    ["0 milliseconds", 0],
    ["0.001 seconds", 1],
    ["1.5 seconds", 1_500],
    ["1 week", 604_800_000],
  ];
  for (const [value, expected] of valid) expect(durationToMillis(value as never)).toBe(expected);
  for (const value of [
    "-1 second",
    "+1 second",
    "00 second",
    "1  second",
    " 1 second",
    "1 second ",
    "1e3 milliseconds",
    "Infinity seconds",
    "0.0001 seconds",
    "1 month",
    "9007199254740992 milliseconds",
  ]) {
    expect(() => durationToMillis(value as never)).toThrow();
  }
});

test("enforces exact memory, attempt, factor, and ordering boundaries", () => {
  expect(memoryBytes("1 MiB")).toBe(1_048_576);
  expect(memoryBytes("1.5 GiB")).toBe(1_610_612_736);
  for (const value of ["0 MiB", "1.1 MiB", "1 MB", "Infinity GiB"]) {
    expect(() => memoryBytes(value)).toThrow();
  }
  expect(
    normalizeRetry({
      maxAttempts: 1,
      initialDelay: "0 milliseconds",
      maxDelay: "0 milliseconds",
      factor: 1.5,
    }),
  ).toMatchObject({ maxAttempts: 1, factor: 1.5 });
  for (const value of [
    { maxAttempts: 1.5 },
    { maxAttempts: 0 },
    { factor: 0.5 },
    { factor: Infinity },
    { initialDelay: "2 seconds", maxDelay: "1 second" },
  ]) {
    expect(() => normalizeRetry(value)).toThrow();
  }
});

test("requires canonical scalar key fields without expressions", () => {
  const schema = z.object({
    tenantId: z.string(),
    count: z.number(),
    optional: z.string().optional(),
    nested: z.object({ id: z.string() }),
  });
  expect(copyConcurrency({ limit: 1, key: "tenantId" }, schema)).toMatchObject({ key: "tenantId" });
  expect(copyAdmission({ idempotency: { key: "count" } }, schema)).toMatchObject({
    idempotency: { key: "count" },
  });
  for (const key of ["optional", "nested", "missing", "tenant.id", "tenant[0]", "$tenantId"]) {
    expect(() => copyConcurrency({ limit: 1, key }, schema)).toThrow();
    expect(() => copyAdmission({ idempotency: { key } }, schema)).toThrow();
  }
});

test("checks calendar instants and positive observer/schedule durations", () => {
  expect(isRfc3339Instant("9999-12-31T23:59:59.999Z")).toBe(true);
  for (const value of [
    "2023-02-29T23:59:59Z",
    "2024-01-01T00:00:00+24:00",
    "0000-01-01T00:00:00Z",
    "275760-09-13T00:00:00Z",
  ]) {
    expect(isRfc3339Instant(value)).toBe(false);
  }
  expect(copyTriggerOptions({ delay: "0 milliseconds" })).toEqual({ delay: "0 milliseconds" });
  expect(validateResultOptions({ timeout: "1 millisecond" })).toEqual({ timeout: "1 millisecond" });
  expect(() => validateResultOptions({ timeout: "0 milliseconds" })).toThrow();
  expect(
    copySchedules([{ id: "repeat", every: "1 millisecond", input: { tenantId: "t" } }], {
      canonicalSchema: z.object({ tenantId: z.string() }),
    }),
  ).toHaveLength(1);
  expect(() =>
    copySchedules([{ id: "repeat", every: "0 milliseconds", input: { tenantId: "t" } }]),
  ).toThrow();
  expect(() =>
    copySchedules([{ id: "repeat", every: "1 minute", timezone: "UTC", input: { tenantId: "t" } }]),
  ).toThrow();
  expect(() => copyTriggerOptions({ delay: "1 second", at: "2026-01-01T00:00:00Z" })).toThrow();
});

test("keeps resource and concurrency numeric limits finite", () => {
  expect(copyResources({ cpu: 0.5, memory: "1 MiB" })).toMatchObject({ cpu: 0.5 });
  for (const resources of [
    { cpu: 0, memory: "1 MiB" },
    { cpu: Infinity, memory: "1 MiB" },
    { cpu: 1, memory: "0.0001 MiB" },
  ]) {
    expect(() => copyResources(resources)).toThrow();
  }
  expect(() => copyConcurrency({ limit: 1.5 })).toThrow();
});

test("requires client projections to match task declarations", () => {
  const task = defineTask({
    id: "client-projection-task",
    version: "1",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    handler: async () => ({ ok: true }),
  });
  expect(() =>
    defineJob({
      name: "missingProgressProjection",
      task,
      client: { public: true, operations: ["get"], fields: ["progress"] },
    } as never),
  ).toThrow("progress schema");
  expect(() =>
    defineJob({
      name: "missingStreamDeclaration",
      task,
      client: { public: true, operations: ["stream"] },
    } as never),
  ).toThrow("declared task streams");
  const emptyStreamsTask = defineTask({
    id: "client-empty-stream-task",
    version: "1",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    streams: {},
    handler: async () => ({ ok: true }),
  });
  expect(() =>
    defineJob({
      name: "emptyStreamDeclaration",
      task: emptyStreamsTask,
      client: { public: true, operations: ["stream"] },
    } as never),
  ).toThrow("declared task streams");

  const streamedTask = defineTask({
    id: "client-stream-task",
    version: "1",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    streams: { updates: z.string() },
    handler: async () => ({ ok: true }),
  });
  expect(() =>
    defineJob({
      name: "missingStreamOperation",
      task: streamedTask,
      client: { public: true, operations: ["get"], streams: ["updates"] },
    } as never),
  ).toThrow("stream operation");
});
