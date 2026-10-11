/**
 * Exercises the live HTTP adapter on owned loopback listeners. Correct bytes,
 * occupied ports and oversized bodies use the same service as packed acceptance;
 * no production application or caller-owned server is terminated by these tests.
 */
import { expect, it } from "@effect/vitest";
import { createServer } from "node:http";
import { Effect, Exit, Layer } from "effect";
import {
  BenchmarkNative,
  benchmarkNativeLive,
} from "../../dev-readiness/benchmark-native.service.js";
import {
  ReadinessBenchmark,
  readinessBenchmarkLive,
} from "../../dev-readiness/benchmark.service.js";
import type { StartRequest } from "../../dev-readiness/benchmark.types.js";

/**
 * Acquires one test listener and joins its native release in the test Scope.
 * @param body - Complete fixed response content.
 * @returns The real ephemeral loopback URL, with no dependency on default dev ports.
 */
const listener = Effect.fn("BenchmarkTest.listener")(function* (body: string) {
  const server = yield* Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<ReturnType<typeof createServer>>((resolve) => {
          const server = createServer((_request, response) => response.end(body));
          server.listen(0, "127.0.0.1", () => resolve(server));
        }),
    ),
    (server) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
  );
  const address = server.address();
  if (address === null || typeof address === "string")
    return yield* Effect.die(new Error("Test listener did not bind a numeric port"));
  return `http://127.0.0.1:${address.port}/hello`;
});

it.live("native probe reads correct complete response and rejects oversized bodies", () =>
  Effect.gen(function* () {
    const native = yield* BenchmarkNative;
    const url = yield* listener("complete response");
    expect(yield* native.probe(url)).toEqual({ status: 200, body: "complete response" });
    const oversized = yield* listener("x".repeat(65_537));
    const exit = yield* Effect.exit(native.probe(oversized));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(exit.cause.reasons[0]).toMatchObject({ _tag: "Fail" });
  }).pipe(Effect.provide(benchmarkNativeLive)),
);

it.live("preflight rejects a stale correct server before launching the command", () =>
  Effect.gen(function* () {
    const url = yield* listener('{"message":"Hello, RelKit!"}');
    const native = yield* BenchmarkNative;
    let starts = 0;
    const fixture = Layer.succeed(BenchmarkNative, {
      ...native,
      start: () =>
        Effect.sync(() => {
          starts += 1;
          throw new Error("Occupied-port preflight must prevent command acquisition");
        }),
    });
    const request: StartRequest = {
      projectRoot: "/not-launched",
      environment: {},
      url,
      expectedStatus: 200,
      expectedBody: '{"message":"Hello, RelKit!"}',
      deadlineMs: 1_000,
    };
    const exit = yield* Effect.exit(
      ReadinessBenchmark.use((benchmark) => benchmark.measure(request)).pipe(
        Effect.provide(readinessBenchmarkLive.pipe(Layer.provide(fixture))),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(starts).toBe(0);
    expect(yield* native.probe(url)).toEqual({ status: 200, body: request.expectedBody });
  }).pipe(Effect.provide(benchmarkNativeLive)),
);
