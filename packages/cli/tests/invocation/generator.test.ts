import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { CliGenerator, generatorLayer } from "../../src/services/generator.service.js";
import type { CliCommandContext } from "../../src/main-support-types.js";

it.effect("interruption waits for physical generator rollback before closing the facade", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let release: () => void = () => {
      throw new Error("Generator was not started.");
    };
    let physicalSignal: AbortSignal | undefined;
    let rolledBack = false;
    const context: CliCommandContext = {
      command: "create",
      args: [],
      json: true,
      signal: new AbortController().signal,
      reporter: { output: () => undefined, error: () => undefined },
      log: () => undefined,
    };
    const operation = Effect.gen(function* () {
      const generator = yield* CliGenerator;
      return yield* generator.generate({}, context);
    }).pipe(
      Effect.provide(
        generatorLayer({
          loadCreateRelkit: async () => ({
            normalizeCreateOptions: () => ({}),
            generateProject: (_options, supplied) => {
              physicalSignal = supplied.signal;
              Deferred.doneUnsafe(entered, Effect.void);
              return new Promise<void>((resolve) => {
                release = () => {
                  rolledBack = true;
                  resolve();
                };
              });
            },
          }),
        }),
      ),
    );
    const worker = yield* Effect.forkChild(operation);
    yield* Deferred.await(entered);
    const stopping = yield* Effect.forkChild(Fiber.interrupt(worker));
    yield* Effect.yieldNow;
    expect(physicalSignal?.aborted).toBe(true);
    expect(rolledBack).toBe(false);
    expect(stopping.pollUnsafe()).toBeUndefined();
    release();
    yield* Fiber.join(stopping);
    expect(rolledBack).toBe(true);
  }),
);

it.effect("the original generator failure remains the adapter cause", () =>
  Effect.gen(function* () {
    const primary = new Error("physical transaction failure");
    const context: CliCommandContext = {
      command: "create",
      args: [],
      json: true,
      signal: new AbortController().signal,
      reporter: { output: () => undefined, error: () => undefined },
      log: () => undefined,
    };
    const exit = yield* Effect.exit(
      Effect.gen(function* () {
        const generator = yield* CliGenerator;
        yield* generator.generate({}, context);
      }).pipe(
        Effect.provide(
          generatorLayer({
            loadCreateRelkit: async () => ({
              normalizeCreateOptions: () => ({}),
              generateProject: async () => {
                throw primary;
              },
            }),
          }),
        ),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(exit.cause.reasons).toContainEqual(
        expect.objectContaining({
          _tag: "Fail",
          error: expect.objectContaining({ cause: primary }),
        }),
      );
  }),
);
