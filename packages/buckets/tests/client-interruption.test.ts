import { Effect, Fiber, Layer } from "effect";
import { describe, expect, test } from "vitest";
import { getBucketEffect } from "../src/client-effects.js";
import { BucketRuntime } from "../src/client-runtime.js";
import type { BucketOperationObservation, BucketProvider } from "../src/client.types.js";

describe("exported bucket Effect interruption", () => {
  test("aborts provider work, releases its listener, and reports cancellation", async () => {
    let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let providerSignal: AbortSignal | undefined;
    let providerAborted = false;
    const observations: BucketOperationObservation[] = [];
    const provider: BucketProvider = {
      get: (_key, context) => {
        providerSignal = context?.signal;
        context?.signal.addEventListener("abort", () => {
          providerAborted = true;
        });
        started();
        return new Promise<Uint8Array | undefined>(() => {});
      },
    };
    const options = {
      ownerId: "job",
      bucketId: "assets",
      source: provider,
      onOperation: (observation: BucketOperationObservation) => observations.push(observation),
    };
    const runtime = Layer.succeed(BucketRuntime, BucketRuntime.of({ options, provider }));
    const fiber = Effect.runFork(Effect.provide(getBucketEffect("a"), runtime));
    await providerStarted;
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(providerSignal?.aborted).toBe(true);
    expect(providerAborted).toBe(true);
    expect(observations).toMatchObject([{ operation: "get", outcome: "cancelled" }]);
  });
});
