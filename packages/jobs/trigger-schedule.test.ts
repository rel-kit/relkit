import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { copyAdmission } from "./src/job-validation.ts";
import { copySchedules } from "./src/schedule-validation.ts";
import {
  copyTriggerOptions,
  defineJob,
  defineTask,
  isRfc3339Instant,
  validateResultOptions,
} from "./src/index.ts";

test("validates trigger and observer boundaries", () => {
  expect(copyTriggerOptions({ delay: "0 seconds", operationId: "op-1" })).toEqual({
    delay: "0 seconds",
    operationId: "op-1",
  });
  expect(
    copyTriggerOptions({ at: "2026-09-14T12:00:00+03:00", idempotencyKey: "key-1" }),
  ).toMatchObject({ at: "2026-09-14T12:00:00+03:00" });
  expect(validateResultOptions({ timeout: "1 millisecond" })).toEqual({
    timeout: "1 millisecond",
  });
  expect(() => copyTriggerOptions({ delay: "1 second", at: "2026-09-14T12:00:00Z" })).toThrow();
  expect(() => copyTriggerOptions({ service: "local" })).toThrow();
  expect(() => validateResultOptions({ timeout: "1 second", service: "local" })).toThrow();
  expect(() => validateResultOptions({ timeout: "0 seconds" })).toThrow();
  expect(() => validateResultOptions({})).toThrow();
});

test("validates exclusive schedules and admission policies", () => {
  expect(
    copySchedules([
      { id: "hourly", cron: "0 * * * *", timezone: "UTC", input: { ok: true } },
      { id: "interval", every: "1 minute", input: { ok: true }, misfire: "latest" },
    ]),
  ).toHaveLength(2);
  expect(
    copyAdmission({ pastAt: "reject", idempotency: { key: "tenantId", retention: "1 day" } }),
  ).toEqual({
    pastAt: "reject",
    idempotency: { key: "tenantId", retention: "1 day" },
  });
  expect(() =>
    copySchedules([{ id: "bad", cron: "* * *", timezone: "UTC", input: null }]),
  ).toThrow();
  expect(() => copySchedules([{ id: "bad", every: "0 seconds", input: null }])).toThrow();
  expect(() => copyAdmission({ idempotency: { key: "tenant.id" } })).toThrow();
});

test("checks real RFC 3339 calendar and offset values", () => {
  expect(isRfc3339Instant("2024-02-29T23:59:59Z")).toBe(true);
  expect(isRfc3339Instant("2023-02-29T23:59:59Z")).toBe(false);
  expect(isRfc3339Instant("2024-01-01T00:00:00+24:00")).toBe(false);
  expect(isRfc3339Instant("2024-01-01T00:00:00")).toBe(false);
});

test("canonicalizes authored schedule inputs through the task input schema", () => {
  const input = z.string().transform(Number);
  const task = defineTask({
    id: "scheduled-input-task",
    version: "1",
    input,
    inputWire: z.number(),
    output: z.number(),
    handler: async () => 1,
  });
  const job = defineJob({
    name: "scheduledInputJob",
    task,
    schedules: [{ id: "numeric", every: "1 minute", input: "7" }],
  });
  expect(job.schedules?.[0]?.input).toBe(7);
});

test("preserves task selectors in copied trigger options", () => {
  const job = {
    ref: { kind: "job", id: "orders.send" },
    task: { ref: { kind: "task", id: "orders.send" }, input: {}, output: {} },
  };
  expect(copyTriggerOptions({ job })).toMatchObject({ job });
});
