import { expect, test } from "bun:test";
import type { NativeScheduleOperations, OperationContext } from "./src/adapter.ts";
import { reconcileNativeSchedules, scheduleOwner } from "./src/schedule-reconciliation.ts";
import type { ScheduleDefinition } from "./src/job-types.ts";
import { scheduleOccurrenceIdentity } from "./src/identity.ts";

const context: OperationContext = {
  signal: new AbortController().signal,
  application: "app",
  environment: "test",
  scope: "trusted",
  service: "jobs",
  serviceGeneration: "generation",
};

test("reconciles owned schedules after worker publication and preserves operator schedules", async () => {
  const desired: ScheduleDefinition[] = [
    { id: "static", cron: "0 * * * *", timezone: "UTC", input: { value: 1 } },
  ];
  const calls: string[] = [];
  const writes: unknown[] = [];
  let attempts = 0;
  const native: NativeScheduleOperations = {
    list: async () => ({
      schedules: [
        { id: "removed", metadata: { owner: scheduleOwner({ context, jobId: "job" }) } },
        { id: "operator", metadata: { owner: "operator" } },
      ],
    }),
    get: async () => ({ outcome: "unavailable" }),
    upsert: async (definition, operation) => {
      calls.push("upsert:" + String(operation.operationId));
      writes.push(definition);
      attempts += 1;
      return attempts === 1 ? { outcome: "unknown" } : { outcome: "updated" };
    },
    pause: async () => ({ outcome: "paused" }),
    resume: async () => ({ outcome: "resumed" }),
    delete: async (id, operation) => {
      calls.push("delete:" + id + ":" + String(operation.operationId));
      return { outcome: "deleted" };
    },
  };
  const result = await reconcileNativeSchedules({
    native,
    desired,
    context,
    jobId: "job",
    buildId: "build",
    workerReady: async () => {
      calls.push("worker-ready");
    },
  });
  expect(calls[0]).toBe("worker-ready");
  expect(calls.filter((call) => call.startsWith("upsert:"))).toHaveLength(2);
  expect(result.deleted).toEqual(["removed"]);
  expect(result.preserved).toEqual(["operator"]);
  expect(
    (writes[0] as { readonly metadata: { readonly canonicalInput: string } }).metadata
      .canonicalInput,
  ).toBe('{"value":1}');
});

test("rejects an ownership collision instead of changing operator state", async () => {
  let listQuery: Readonly<Record<string, unknown>> | undefined;
  const native: NativeScheduleOperations = {
    list: async (query) => {
      listQuery = query;
      return { schedules: [{ id: "same", metadata: { owner: "operator" } }] };
    },
    get: async () => ({ outcome: "unavailable" }),
    upsert: async () => ({ outcome: "updated" }),
    pause: async () => ({ outcome: "paused" }),
    resume: async () => ({ outcome: "resumed" }),
    delete: async () => ({ outcome: "deleted" }),
  };
  await expect(
    reconcileNativeSchedules({
      native,
      desired: [{ id: "same", every: "1 minute", input: { value: 1 } }],
      context,
      jobId: "job",
      buildId: "build",
    }),
  ).rejects.toThrow("RELKIT_SCHEDULE_OWNERSHIP_CONFLICT:same");
  expect(listQuery).toEqual({ scope: "trusted", jobId: "job" });
});

test("keeps an owned operator pause while updating input/build and gives each tick a fresh identity", async () => {
  const paused: string[] = [];
  const native: NativeScheduleOperations = {
    list: async () => ({
      schedules: [
        {
          id: "paused",
          state: "paused",
          metadata: { owner: scheduleOwner({ context, jobId: "job" }) },
        },
      ],
    }),
    get: async () => ({ outcome: "unavailable" }),
    upsert: async () => ({ outcome: "updated" }),
    pause: async (id) => {
      paused.push(id);
      return { outcome: "paused" };
    },
    resume: async () => ({ outcome: "resumed" }),
    delete: async () => ({ outcome: "deleted" }),
  };
  await reconcileNativeSchedules({
    native,
    desired: [{ id: "paused", every: "5 minutes", input: { changed: true } }],
    context,
    jobId: "job",
    buildId: "new-build",
  });
  expect(paused).toEqual(["paused"]);
  expect(scheduleOccurrenceIdentity("paused", "2026-09-15T00:00:00.000Z")).not.toBe(
    scheduleOccurrenceIdentity("paused", "2026-09-15T00:05:00.000Z"),
  );
  expect(scheduleOccurrenceIdentity("paused", "2026-09-15T00:00:00.000Z")).toBe(
    scheduleOccurrenceIdentity("paused", "2026-09-15T00:00:00.000Z"),
  );
});
