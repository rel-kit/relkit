import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliJobsSdk, jobsSdkLayer } from "../../src/services/jobs-sdk.service.js";

/**
 * Borrows native fetch for one scoped deterministic SDK scenario.
 * @param implementation - One request implementation whose signals are preserved.
 * @returns Scope-owned installation restoring the previous authority after settlement.
 */
function replaceFetch(
  implementation: (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: RequestInit,
  ) => Promise<Response>,
) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const previous = globalThis.fetch;
      globalThis.fetch = Object.assign(implementation, { preconnect: previous.preconnect });
      return previous;
    }),
    (previous) =>
      Effect.sync(() => {
        globalThis.fetch = previous;
      }),
  );
}

it.effect("an interrupted trigger aborts once and waits for physical SDK settlement", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let signal: AbortSignal | undefined;
    let calls = 0;
    let complete: () => void = () => {
      throw new Error("Request not started");
    };
    yield* replaceFetch(async (_input, init) => {
      calls++;
      signal = init?.signal ?? undefined;
      const pending = new Promise<void>((resolve) => {
        complete = resolve;
      });
      Deferred.doneUnsafe(entered, Effect.void);
      await pending;
      return Response.json({ json: { accepted: true } });
    });
    const worker = yield* Effect.forkChild(
      CliJobsSdk.use((sdk) =>
        sdk.trigger("http://127.0.0.1:3000", {}, "example", {}, new AbortController().signal),
      ).pipe(Effect.provide(jobsSdkLayer), Effect.provide(cleanupLayer)),
    );
    yield* Deferred.await(entered);
    const stopping = yield* Effect.forkChild(Fiber.interrupt(worker));
    yield* Effect.yieldNow;
    expect(signal?.aborted).toBe(true);
    expect(stopping.pollUnsafe()).toBeUndefined();
    complete();
    yield* Fiber.join(stopping);
    expect(calls).toBe(1);
  }),
);

it.effect(
  "watch interruption joins exactly one body cancellation and retains its cleanup cause",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const cancellation = yield* Deferred.make<void>();
      const cleanup = new Error("native watch release failed");
      let cancellations = 0;
      let finish: () => void = () => {
        throw new Error("Cancellation not started");
      };
      yield* replaceFetch(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(":\n\n"));
              },
              async cancel() {
                cancellations++;
                const pending = new Promise<void>((resolve) => {
                  finish = resolve;
                });
                Deferred.doneUnsafe(cancellation, Effect.void);
                await pending;
                throw cleanup;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
      );
      const layer = jobsSdkLayer.pipe(Layer.provideMerge(cleanupLayer));
      const result = yield* Effect.gen(function* () {
        const sdk = yield* CliJobsSdk;
        const evidence = yield* CliCleanup;
        const worker = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const iterator = yield* sdk.watch(
                "http://127.0.0.1:3000",
                {},
                "example",
                {},
                new AbortController().signal,
              );
              Deferred.doneUnsafe(entered, Effect.void);
              yield* Effect.promise(() => iterator.next());
            }),
          ),
        );
        yield* Deferred.await(entered);
        const stopping = yield* Effect.forkChild(Fiber.interrupt(worker));
        yield* Deferred.await(cancellation);
        expect(stopping.pollUnsafe()).toBeUndefined();
        finish();
        yield* Fiber.join(stopping);
        const exit = yield* Fiber.await(worker);
        return { exit, issues: yield* evidence.snapshot() };
      }).pipe(Effect.provide(layer));
      expect(Exit.isFailure(result.exit)).toBe(true);
      if (Exit.isFailure(result.exit)) expect(Cause.hasInterrupts(result.exit.cause)).toBe(true);
      expect(cancellations).toBe(1);
      expect(
        result.issues.some(
          (issue) =>
            issue.operation === "jobs.sdk.body-release" && Cause.squash(issue.cause) === cleanup,
        ),
      ).toBe(true);
    }),
);
