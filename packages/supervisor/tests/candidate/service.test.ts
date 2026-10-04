import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { CandidatePlatform } from "../../src/candidate-platform.js";
import { createCandidateLayer, SupervisorCandidate } from "../../src/candidate-service.js";
import { captureOutputLines } from "../../src/output-lines.js";
import { nativeGate } from "../fixtures/native-gate.js";
import type { CandidateCompileResult } from "../../src/candidate.types.js";

it.effect("interrupted native port allocation joins settlement without spawning a process", () =>
  Effect.gen(function* () {
    const native = nativeGate<number>();
    const entered = yield* Deferred.make<void>();
    let spawns = 0;
    let cleanups = 0;
    const platform = Layer.succeed(CandidatePlatform, {
      directory: async () => undefined,
      access: async () => undefined,
      cleanup: async () => {
        cleanups++;
      },
      port: () => {
        Deferred.doneUnsafe(entered, Effect.void);
        return native.promise;
      },
      spawn: () => {
        spawns++;
        throw new Error("Interrupted startup cannot spawn.");
      },
      stop: async () => undefined,
      output: async () => ({ stdout: "", stderr: "", truncated: false }),
    });
    yield* Effect.gen(function* () {
      const service = yield* SupervisorCandidate;
      const starting = yield* Effect.forkChild(service.start);
      yield* Deferred.await(entered);
      const closing = yield* Effect.forkChild(Fiber.interrupt(starting), {
        startImmediately: true,
      });
      expect(closing.pollUnsafe()).toBeUndefined();
      expect(spawns).toBe(0);
      native.complete(3001);
      yield* Fiber.join(closing);
      const exit = yield* Fiber.await(starting);
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(spawns).toBe(0);
    }).pipe(
      Effect.ensuring(Effect.sync(() => native.complete(3001))),
      Effect.provide(
        createCandidateLayer({
          projectRoot: "/candidate-test-root",
          token: { sourceToken: 5, generationToken: 5 },
          compile: async () => ({ entrypoint: "server.ts" }),
        }).pipe(Layer.provide(platform)),
      ),
    );
    expect(cleanups).toBe(1);
  }).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
);

it.live("native framing releases its reader when a sink throws during framing or final flush", () =>
  Effect.promise(async () => {
    for (const output of ["one\ntwo\n", "one"]) {
      const error = new Error("sink defect");
      let emissions = 0;
      const stream = new ReadableStream<Uint8Array>({
        /** Supplies bounded native output. @param controller - Stream owner. @returns After native EOF. */
        start(controller) {
          controller.enqueue(new TextEncoder().encode(output));
          controller.close();
        },
      });
      await expect(
        captureOutputLines(stream, () => {
          emissions++;
          throw error;
        }),
      ).rejects.toBe(error);
      expect(emissions).toBe(1);
      expect(stream.locked).toBe(false);
    }
  }),
);

it.live(
  "a framing timer sink failure rejects native consumption and cancels the pending reader",
  () =>
    Effect.promise(async () => {
      const error = new Error("timer sink defect");
      let cancellations = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          /** Supplies a line before a pending read. @param controller - Stream owner. @returns After native admission. */
          start(controller) {
            controller.enqueue(new TextEncoder().encode("one\n"));
          },
          /** Counts actual reader cancellation. @returns After native cleanup acknowledgement. */
          cancel() {
            cancellations++;
          },
        },
        { highWaterMark: 0 },
      );
      await expect(
        captureOutputLines(stream, () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(cancellations).toBe(1);
      expect(stream.locked).toBe(false);
    }),
);

it.effect("interrupted compilation joins native settlement before directory cleanup", () =>
  Effect.gen(function* () {
    const native = nativeGate<CandidateCompileResult>();
    const entered = yield* Deferred.make<void>();
    const aborted = yield* Deferred.make<void>();
    let cleanups = 0;
    const platform = Layer.succeed(CandidatePlatform, {
      directory: async () => undefined,
      access: async () => undefined,
      cleanup: async () => {
        cleanups++;
      },
      port: async () => 3001,
      spawn: () => {
        throw new Error("Compilation fixture cannot spawn.");
      },
      stop: async () => undefined,
      output: async () => ({ stdout: "", stderr: "", truncated: false }),
    });
    yield* Effect.gen(function* () {
      const service = yield* SupervisorCandidate;
      const compiling = yield* Effect.forkChild(service.compile);
      yield* Deferred.await(entered);
      const closing = yield* Effect.forkChild(Fiber.interrupt(compiling));
      yield* Deferred.await(aborted);
      expect(cleanups).toBe(0);
      expect(closing.pollUnsafe()).toBeUndefined();
      native.complete({ entrypoint: "server.ts" });
      yield* Fiber.join(closing);
      expect(cleanups).toBe(0);
    }).pipe(
      Effect.ensuring(Effect.sync(() => native.complete({ entrypoint: "server.ts" }))),
      Effect.provide(
        createCandidateLayer({
          projectRoot: "/candidate-test-root",
          token: { sourceToken: 4, generationToken: 4 },
          compile: ({ signal }) => {
            signal.addEventListener("abort", () => Deferred.doneUnsafe(aborted, Effect.void), {
              once: true,
            });
            Deferred.doneUnsafe(entered, Effect.void);
            return native.promise;
          },
        }).pipe(Layer.provide(platform)),
      ),
    );
    expect(cleanups).toBe(1);
  }).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
);

it.effect("acquisition is prompt and concurrent callers share one owned compile", () =>
  Effect.gen(function* () {
    let directories = 0;
    let compilations = 0;
    let released = 0;
    const platform = Layer.succeed(CandidatePlatform, {
      directory: async () => {
        directories++;
      },
      access: async () => undefined,
      cleanup: async () => {
        released++;
      },
      port: async () => 3001,
      spawn: () => {
        throw new Error("Compile test cannot spawn");
      },
      stop: async () => undefined,
      output: async () => ({ stdout: "", stderr: "", truncated: false }),
    });
    yield* Effect.gen(function* () {
      const service = yield* SupervisorCandidate;
      expect(directories).toBe(0);
      const values = yield* Effect.forEach([1, 2], () => service.compile, { concurrency: 2 });
      expect(values[0]).toBe(values[1]);
      expect(directories).toBe(1);
      expect(compilations).toBe(1);
      expect(released).toBe(0);
    }).pipe(
      Effect.provide(
        createCandidateLayer({
          projectRoot: "/candidate-test-root",
          token: { sourceToken: 1, generationToken: 1 },
          compile: async () => {
            compilations++;
            return { entrypoint: "server.ts" };
          },
        }).pipe(Layer.provide(platform)),
      ),
    );
    expect(released).toBe(1);
  }).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
);

it.effect(
  "failed entrypoint acquisition retains native error identity and releases its prefix",
  () =>
    Effect.gen(function* () {
      const error = new Error("entrypoint unavailable");
      let released = 0;
      const platform = Layer.succeed(CandidatePlatform, {
        directory: async () => undefined,
        access: async () => {
          throw error;
        },
        cleanup: async () => {
          released++;
        },
        port: async () => 3001,
        spawn: () => {
          throw new Error("Failed compile cannot spawn");
        },
        stop: async () => undefined,
        output: async () => ({ stdout: "", stderr: "", truncated: false }),
      });
      yield* Effect.gen(function* () {
        const service = yield* SupervisorCandidate;
        const exit = yield* Effect.exit(service.compile);
        expect(
          Exit.isFailure(exit) &&
            exit.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === error),
        ).toBe(true);
      }).pipe(
        Effect.provide(
          createCandidateLayer({
            projectRoot: "/candidate-test-root",
            token: { sourceToken: 2, generationToken: 2 },
            compile: async () => ({ entrypoint: "server.ts" }),
          }).pipe(Layer.provide(platform)),
        ),
      );
      expect(released).toBe(1);
    }).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
);

it.effect("pending native output cancellation releases its reader and framing timer", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const caller = new AbortController();
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => {
        Deferred.doneUnsafe(entered, Effect.void);
        return new Promise<void>(() => undefined);
      },
      cancel: () => {
        cancelled++;
      },
    });
    const reading = yield* Effect.forkChild(
      Effect.tryPromise({
        try: () => captureOutputLines(stream, () => undefined, { signal: caller.signal }),
        catch: (error) => error,
      }),
    );
    yield* Deferred.await(entered);
    caller.abort(new Error("test owner closed"));
    yield* Fiber.join(reading);
    expect(cancelled).toBe(1);
    expect(stream.locked).toBe(false);
  }),
);
