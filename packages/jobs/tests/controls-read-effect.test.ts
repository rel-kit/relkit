import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  ControlReadFailure,
  getRunOperationEffect,
  getRunValue,
  listRunsOperationEffect,
  listRunsValue,
} from "../src/controls-read.ts";
import type { JobsRuntime } from "../src/runtime.ts";
test("native reads validate capability and limit before context or provider work", async () => {
  let contexts = 0;
  let starts = 0;
  const runtime = {
    capabilities: { service: "test", features: { read: false, list: true } },
    adapter: {
      get: async () => {
        starts++;
        throw new Error("unexpected read");
      },
      list: async () => {
        starts++;
        throw new Error("unexpected list");
      },
    },
    operationContext: () => {
      contexts++;
      return { signal: new AbortController().signal };
    },
  } as unknown as JobsRuntime;
  const read = await Effect.runPromise(Effect.result(getRunOperationEffect(runtime, "run")));
  const list = await Effect.runPromise(
    Effect.result(listRunsOperationEffect(runtime, { limit: 0 })),
  );
  expect(Result.isFailure(read)).toBe(true);
  expect(Result.isFailure(list)).toBe(true);
  if (Result.isFailure(read)) expect(read.failure).toBeInstanceOf(ControlReadFailure);
  if (Result.isFailure(list)) expect(list.failure).toBeInstanceOf(ControlReadFailure);
  expect(contexts).toBe(0);
  expect(starts).toBe(0);
  await expect(getRunValue(runtime, "run")).rejects.toThrow();
  await expect(listRunsValue(runtime, { limit: 0 })).rejects.toThrow(RangeError);
});
test("native read provider failures preserve their cause for compatibility", async () => {
  const readError = new Error("read unavailable");
  const listError = new Error("list unavailable");
  const runtime = {
    capabilities: { service: "test", features: { read: true, list: true } },
    adapter: {
      get: async () => {
        throw readError;
      },
      list: async () => {
        throw listError;
      },
    },
    operationContext: ({ signal }: { signal: AbortSignal }) => ({ signal }),
  } as unknown as JobsRuntime;
  const read = await Effect.runPromise(Effect.result(getRunOperationEffect(runtime, "run")));
  const list = await Effect.runPromise(Effect.result(listRunsOperationEffect(runtime)));
  if (Result.isFailure(read)) expect(read.failure.cause).toBe(readError);
  else throw new Error("expected read failure");
  if (Result.isFailure(list)) expect(list.failure.cause).toBe(listError);
  else throw new Error("expected list failure");
  await expect(getRunValue(runtime, "run")).rejects.toBe(readError);
  await expect(listRunsValue(runtime)).rejects.toBe(listError);
});
