import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { JOBS_ADAPTER_PROTOCOL_VERSION } from "../src/adapter.ts";
import type { JobsAdapterRuntime } from "../src/adapter.ts";
import {
  createJobsRuntime,
  createJobsRuntimeEffect,
  currentJobsRuntimeEffect,
  JobsRuntimeCallbackError,
  JobsRuntimeError,
  requireJobsRuntime,
  requireJobsRuntimeEffect,
  runInJobsRuntime,
  runInJobsRuntimeEffect,
} from "../src/runtime.ts";
let closes = 0;
const adapter = {
  kind: "jobs-adapter-runtime",
  protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
  capabilities: { service: "test", features: {} },
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
  close: async () => {
    closes++;
  },
} as JobsAdapterRuntime;
test("Effect creates a runtime and closes the owned adapter once", async () => {
  closes = 0;
  const runtime = await Effect.runPromise(createJobsRuntimeEffect({ adapter }));
  expect(runtime.service).toBe("test");
  expect(createJobsRuntime({ adapter }).service).toBe("test");
  await Promise.all([runtime.close(), runtime.close()]);
  expect(closes).toBe(1);
});
test("invalid manifest has a tagged Effect failure and a TypeError adapter", async () => {
  const options = { adapter, manifest: { protocol: "wrong" } };
  const result = await Effect.runPromise(Effect.result(createJobsRuntimeEffect(options)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(JobsRuntimeError);
  expect(() => createJobsRuntime(options)).toThrow(TypeError);
});
test("ambient runtime is visible to callbacks and original callback throws survive", async () => {
  const runtime = createJobsRuntime({ adapter });
  expect(await Effect.runPromise(currentJobsRuntimeEffect())).toBeUndefined();
  const absent = await Effect.runPromise(Effect.result(requireJobsRuntimeEffect()));
  expect(Result.isFailure(absent)).toBe(true);
  expect(() => requireJobsRuntime()).toThrow("RELKIT_JOBS_RUNTIME_UNBOUND");
  expect(await Effect.runPromise(runInJobsRuntimeEffect(runtime, () => runtime))).toBe(runtime);
  expect(runInJobsRuntime(runtime, () => requireJobsRuntime())).toBe(runtime);
  const thrown = new Error("callback");
  const failed = await Effect.runPromise(
    Effect.result(
      runInJobsRuntimeEffect(runtime, () => {
        throw thrown;
      }),
    ),
  );
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) {
    expect(failed.failure).toBeInstanceOf(JobsRuntimeCallbackError);
    expect(failed.failure.cause).toBe(thrown);
  }
  expect(() =>
    runInJobsRuntime(runtime, () => {
      throw thrown;
    }),
  ).toThrow(thrown);
});
