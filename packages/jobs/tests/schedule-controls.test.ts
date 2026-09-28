import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import type { JobsAdapterRuntime, NativeScheduleOperations } from "../src/adapter.ts";
import { JOBS_ADAPTER_PROTOCOL_VERSION } from "../src/adapter.ts";
import type { ScheduleDefinition } from "../src/job.types.ts";
import { createJobsRuntime } from "../src/runtime.ts";
import {
  createScheduleControls,
  createScheduleControlsEffect,
  JobScheduleControlFailure,
  listSchedulesEffect,
} from "../src/schedule-controls.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
function fixture(schedules: NativeScheduleOperations): JobsAdapterRuntime {
  return {
    kind: "jobs-adapter-runtime",
    protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
    capabilities: { service: "test", features: { schedules: true } },
    schedules,
    submit: async () => {
      throw new Error("unused");
    },
    get: async () => {
      throw new Error("unused");
    },
    list: async () => {
      throw new Error("unused");
    },
    observe: async function* () {
      yield* [];
    },
    cancel: async () => {
      throw new Error("unused");
    },
    close: async () => {},
  } as JobsAdapterRuntime;
}
test("schedule controls validate reads and write receipts", async () => {
  const calls: string[] = [];
  const schedules: NativeScheduleOperations = {
    list: async () => {
      calls.push("list");
      return { outcome: "available", schedules: [] };
    },
    get: async () => {
      calls.push("get");
      return { outcome: "available", schedule: {} };
    },
    upsert: async () => {
      calls.push("upsert");
      return { operationId: "op-1", scheduleId: "sched-1", outcome: "created" };
    },
    pause: async () => {
      calls.push("pause");
      return { operationId: "op-2", scheduleId: "sched-1", outcome: "paused" };
    },
    resume: async () => {
      calls.push("resume");
      return { operationId: "op-3", scheduleId: "sched-1", outcome: "resumed" };
    },
    delete: async () => {
      calls.push("delete");
      return { operationId: "op-4", scheduleId: "sched-1", outcome: "deleted" };
    },
  };
  const runtime = createJobsRuntime({ adapter: fixture(schedules) });
  const controls = createScheduleControls(runtime);
  expect((await controls.list()).outcome).toBe("available");
  expect((await controls.get("sched-1")).outcome).toBe("available");
  const definition = { id: "sched-1" } as ScheduleDefinition;
  expect((await controls.upsert(definition, { operationId: "op-1" })).outcome).toBe("created");
  await controls.pause("sched-1", { operationId: "op-2" });
  await controls.resume("sched-1", { operationId: "op-3" });
  await controls.delete("sched-1", { operationId: "op-4" });
  expect(calls).toEqual(["list", "get", "upsert", "pause", "resume", "delete"]);
  await expect(controls.list({ limit: 0 })).rejects.toThrow(RangeError);
  expect(calls).toHaveLength(6);
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  expect(Effect.runSync(createScheduleControlsEffect(runtime))).toBeDefined();
  const read = await Effect.runPromise(
    Effect.provide(listSchedulesEffect(runtime, schedules), layer),
  );
  expect(read.outcome).toBe("available");
  expect(seen).toEqual(["schedule.list", "capability.assert"]);
  const invalid = await Effect.runPromise(
    Effect.result(listSchedulesEffect(runtime, schedules, { limit: 0 })),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(JobScheduleControlFailure);
});
