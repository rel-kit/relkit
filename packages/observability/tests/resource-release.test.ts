import { expect, test } from "vitest";
import { Effect, Fiber } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityIndex,
  createObservabilityRuntime,
  createObservabilitySegmentStore,
} from "../src/index.ts";
import { releaseResources, releaseResourcesEffect } from "../src/resource-release.ts";

test("release runs every action and preserves the first error", async () => {
  const first = new Error("first release failed");
  const order: string[] = [];
  await expect(
    releaseResources([
      () => {
        order.push("first");
        throw first;
      },
      async () => {
        order.push("second");
        throw new Error("second release failed");
      },
      () => {
        order.push("third");
      },
    ]),
  ).rejects.toBe(first);
  expect(order).toEqual(["first", "second", "third"]);
});

test("interruption waits for all release actions", async () => {
  let markStarted!: () => void;
  let finishFirst!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const first = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const released: string[] = [];
  const fiber = Effect.runFork(
    releaseResourcesEffect([
      () => {
        markStarted();
        return first;
      },
      () => {
        released.push("second");
      },
    ]),
  );
  await started;
  const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
  finishFirst();
  await interrupted;
  expect(released).toEqual(["second"]);
});

test("runtime closes its stream after exporter flush fails", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-observability-release-"));
  const failure = new Error("flush failed");
  let exporterCloses = 0;
  try {
    const runtime = await createObservabilityRuntime({
      root,
      exporter: {
        exportRecord: () => undefined,
        flush: async () => {
          throw failure;
        },
        close: async () => {
          exporterCloses += 1;
        },
        stats: () => [],
        setFailureHandler: () => undefined,
      },
    });
    await expect(runtime.close()).rejects.toBe(failure);
    await expect(runtime.close()).rejects.toBe(failure);
    expect(exporterCloses).toBe(1);
    expect(() =>
      runtime.stream.publish("log.emitted", {
        version: 2,
        signal: "log",
        timestamp: "2026-09-02T00:00:00.000Z",
        level: "info",
        component: "test",
        message: "after close",
        fields: {},
      }),
    ).toThrow("Stream is closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("segment shutdown closes remaining handles after index finalization fails", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-segment-release-"));
  const failure = new Error("index finalization failed");
  const index = await createObservabilityIndex({ root });
  try {
    const store = await createObservabilitySegmentStore({
      root,
      index: {
        append: index.append,
        finalize: async () => {
          throw failure;
        },
      },
    });
    const record = {
      version: 2 as const,
      signal: "log" as const,
      timestamp: "2026-09-02T00:00:00.000Z",
      level: "info" as const,
      component: "test",
      message: "safe",
      fields: {},
    };
    await store.append(record);
    await expect(store.close()).rejects.toBe(failure);
    await expect(store.close()).resolves.toBeUndefined();
    await expect(store.append(record)).rejects.toThrow("closed");
  } finally {
    await index.close();
    await rm(root, { recursive: true, force: true });
  }
});
