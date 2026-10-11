/**
 * Exercises the prepared-candidate probe across the short interval where
 * supervisor health has advanced but the application socket is not yet accepting.
 * Injected adapters prove connection refusal is retried without wall-clock delay.
 */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  makeSnapshotProbeOperations,
  SnapshotProbe,
} from "../../src/dev-snapshot/snapshot-probe.service.js";

it.effect("retries transient connection refusal before reading the complete response", () => {
  let attempts = 0;
  const delays: number[] = [];
  const fetcher = (async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("connection refused");
    return new Response("ready");
  }) as typeof fetch;
  return Effect.gen(function* () {
    const probe = yield* SnapshotProbe;
    expect(yield* probe.read(3210, "/hello", new AbortController().signal)).toEqual({
      status: 200,
      body: "ready",
    });
    expect(attempts).toBe(2);
    expect(delays).toEqual([5]);
  }).pipe(
    Effect.provideService(
      SnapshotProbe,
      makeSnapshotProbeOperations(fetcher, async (milliseconds) => {
        delays.push(milliseconds);
      }),
    ),
  );
});
