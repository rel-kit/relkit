import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { JobsAdapterRuntime } from "../src/adapter.ts";
import { JOBS_ADAPTER_PROTOCOL_VERSION } from "../src/adapter.ts";
import {
  cancelRunEffect,
  createJobsControls,
  createJobsControlsEffect,
  getRunEffect,
  JobControlFailure,
  listRunsEffect,
  observeRunEffect,
} from "../src/controls.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import { createJobsRuntime } from "../src/runtime.ts";
const run = {
  accepted: true,
  runId: "run-1",
  jobId: "job-1",
  taskId: "task-1",
  taskVersion: "1",
  acceptedAt: "2026-01-01T00:00:00.000Z",
  buildId: "build-1",
  service: "test",
  status: "completed",
  observedAt: "2026-01-01T00:00:01.000Z",
  resultAvailability: "available",
  output: "done",
} as const satisfies RunSnapshot;
test("run controls read, observe, cancel, retry, and await a result", async () => {
  const calls: string[] = [];
  let returned = false;
  const adapter = {
    kind: "jobs-adapter-runtime",
    protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
    capabilities: {
      service: "test",
      features: {
        read: true,
        list: true,
        observation: true,
        cancel: true,
        retry: true,
      },
    },
    get: async () => {
      calls.push("get");
      return run;
    },
    list: async () => {
      calls.push("list");
      return { items: [run], hasMore: false, availability: [] };
    },
    observe: async function* () {
      try {
        yield {
          kind: "snapshot" as const,
          run,
          observedAt: run.observedAt,
          epoch: "1",
          sequence: 1,
          continuity: "state" as const,
        };
      } finally {
        returned = true;
      }
    },
    cancel: async (request: { runId: string; operationId: string }) => {
      calls.push("cancel");
      return { runId: request.runId, operationId: request.operationId, outcome: "requested" };
    },
    retry: async (request: { runId: string }) => {
      calls.push("retry");
      return {
        accepted: true,
        runId: "run-2",
        jobId: run.jobId,
        taskId: run.taskId,
        taskVersion: run.taskVersion,
        acceptedAt: run.acceptedAt,
        retryOfRunId: request.runId,
      };
    },
    submit: async () => {
      throw new Error("unused");
    },
    close: async () => {},
  } as JobsAdapterRuntime;
  const runtime = createJobsRuntime({ adapter });
  const controls = createJobsControls(runtime);
  expect((await controls.get("run-1")).runId).toBe("run-1");
  expect((await controls.list()).items).toHaveLength(1);
  const frames = [];
  for await (const frame of controls.observe({ locator: "run-1" })) frames.push(frame);
  expect(frames.map((frame) => frame.kind)).toEqual(["snapshot"]);
  expect(returned).toBe(true);
  expect((await controls.cancel("run-1", { operationId: "cancel-1" })).outcome).toBe("requested");
  expect((await controls.retry("run-1", { operationId: "retry-1" })).runId).toBe("run-2");
  expect(await controls.result("run-1", { timeout: "1 second" })).toBe("done");
  expect(calls).toEqual(["get", "list", "cancel", "get", "retry", "get"]);
  await expect(controls.list({ limit: 0 })).rejects.toThrow(RangeError);
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
  expect(Effect.runSync(createJobsControlsEffect(runtime))).toBeDefined();
  expect(
    (await Effect.runPromise(Effect.provide(getRunEffect(runtime, "run-1"), layer))).runId,
  ).toBe("run-1");
  expect(seen).toEqual(["control.get", "controlSupport.requireMethod", "controlSupport.context"]);
  const invalid = await Effect.runPromise(Effect.result(listRunsEffect(runtime, { limit: 0 })));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(JobControlFailure);
  expect(Effect.runSync(observeRunEffect(runtime, { locator: "run-1" }))).toBeDefined();
  expect(
    (await Effect.runPromise(cancelRunEffect(runtime, "run-1", { operationId: "cancel-effect" })))
      .outcome,
  ).toBe("requested");
});
