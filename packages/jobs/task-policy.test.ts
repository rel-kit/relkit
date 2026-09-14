import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  defineTask,
  memoryBytes,
  retryDelayMillis,
  TASK_MAX_TAGS,
} from "./src/index.ts";

const base = {
  id: "policy.task",
  version: "1",
  input: z.object({ tenantId: z.string() }),
  output: z.void(),
  handler: () => undefined,
} as const;

test("freezes task policy defaults and applies retry-after lower bounds", () => {
  const task = defineTask({
    ...base,
    progress: z.object({ done: z.number() }),
    streams: { text: z.string() },
    resources: { cpu: 2, memory: "1.5 GiB" },
    concurrency: { limit: 2, key: "tenantId" },
    logging: { level: "info", redact: ["input.secret"] },
  });

  expect(task.retry).toEqual({
    maxAttempts: 3,
    initialDelay: "1 second",
    maxDelay: "30 seconds",
    factor: 2,
    jitter: "none",
  });
  expect(task.observation).toEqual({ progress: "live", streams: { text: "live" } });
  expect(Object.isFrozen(task.retry)).toBe(true);
  expect(Object.isFrozen(task.resources)).toBe(true);
  expect(retryDelayMillis(task.retry, 1, 2_000)).toBe(2_000);
  expect(retryDelayMillis({ ...task.retry, jitter: "full" }, 2, 0, () => 0)).toBe(0);
  expect(memoryBytes("1.5 GiB")).toBe(1_610_612_736);
});

test("rejects unsupported task policy combinations and unsafe bounds", () => {
  expect(() => defineTask({ ...base, maxDuration: "0 seconds" })).toThrow();
  expect(() => defineTask({ ...base, resources: { cpu: Infinity, memory: "1 MiB" } })).toThrow();
  expect(() => defineTask({ ...base, resources: { cpu: 1, memory: "0.1 MiB" } })).toThrow();
  expect(() => defineTask({ ...base, concurrency: { limit: 1, key: "tenant.id" } })).toThrow();
  expect(() => defineTask({ ...base, observation: { progress: "live" } })).toThrow();
  expect(() => defineTask({ ...base, tags: Array.from({ length: TASK_MAX_TAGS + 1 }, () => "tag") })).toThrow();
  expect(() => defineTask({ ...base, dependencies: { functions: {} } as never })).toThrow();
});

test("requires an identity-preserving wire schema for transformed input", () => {
  const input = z.string().transform(Number);
  expect(() =>
    defineTask({ id: "transformed.task", version: "1", input, output: z.number(), handler: (value) => value }),
  ).toThrow("inputWire");
  expect(
    defineTask({
      id: "transformed.task",
      version: "1",
      input,
      inputWire: z.number(),
      output: z.number(),
      handler: (value) => value,
    }).inputWire,
  ).toBeDefined();
});

test("rejects declarations without executable canonical validators", () => {
  const transformed = z.string().transform(Number);
  expect(() => defineTask({ ...base, output: transformed, handler: (value) => value })).toThrow(
    "canonical",
  );
  expect(() =>
    defineTask({ ...base, progress: transformed, handler: () => undefined }),
  ).toThrow("canonical");
  expect(() =>
    defineTask({ ...base, streams: { values: transformed }, handler: () => undefined }),
  ).toThrow("canonical");
  expect(() =>
    defineTask({
      ...base,
      input: z.string().transform(Number),
      inputWire: z.number().transform((value) => value + 1),
      handler: (value) => value,
    }),
  ).toThrow("canonical");
});
