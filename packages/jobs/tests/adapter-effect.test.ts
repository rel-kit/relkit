import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  assertJobsAdapterRuntime,
  assertJobsAdapterRuntimeEffect,
  isJobsAdapterRuntime,
  isJobsAdapterRuntimeEffect,
  JobsAdapterValidationError,
  JOBS_ADAPTER_PROTOCOL_VERSION,
} from "../src/adapter.ts";
import type { JobsAdapterRuntime } from "../src/adapter.ts";
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
  close: async () => {},
} as JobsAdapterRuntime;
test("Effect and synchronous adapters accept a valid runtime", async () => {
  await Effect.runPromise(assertJobsAdapterRuntimeEffect(adapter));
  expect(() => assertJobsAdapterRuntime(adapter)).not.toThrow();
  expect(await Effect.runPromise(isJobsAdapterRuntimeEffect(adapter))).toBe(true);
  expect(isJobsAdapterRuntime(adapter)).toBe(true);
});
test("invalid adapter shape fails with tagged Effect errors", async () => {
  const invalid = await Effect.runPromise(Effect.result(assertJobsAdapterRuntimeEffect(null)));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(JobsAdapterValidationError);
    expect(invalid.failure.reason).toContain("object");
  }
  expect(() => assertJobsAdapterRuntime(null)).toThrow(TypeError);
  expect(await Effect.runPromise(isJobsAdapterRuntimeEffect(null))).toBe(false);
});
