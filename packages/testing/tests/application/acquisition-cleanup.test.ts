/** Preserves native startup and release failures when a partially acquired application unwinds.
 * The injected platform uses the actual runtime owner and verifies its temporary state is released.
 */
import { expect, it } from "@effect/vitest";
import { existsSync } from "node:fs";
import { defineEnv } from "@relkit/config";
import type { ProviderRegistry } from "@relkit/engine";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  TestApplicationHarness,
  TestApplicationPlatform,
  testApplicationLayer,
} from "../../src/application.js";

/** Supplies only the provider registry release seam reached during failed startup. */
function failingRegistry(failure: Error): ProviderRegistry {
  return {
    generationId: "cleanup-test",
    requirements: [],
    handles: {},
    get: () => undefined,
    resolve: () => {
      throw new Error("No fixture provider");
    },
    release: async () => {
      throw failure;
    },
    dispose: async () => undefined,
  };
}

it.effect(
  "retains primary startup failure and failed provider release while draining runtime",
  () =>
    Effect.gen(function* () {
      const primary = new Error("selected service startup failed");
      const cleanup = new Error("provider release failed");
      let root: string | undefined;
      const platform = Layer.succeed(
        TestApplicationPlatform,
        TestApplicationPlatform.of({
          artifacts: async () => undefined,
          routes: async () => [],
          providers: async (_artifacts, _providers, _bindings, fakes) => {
            root = fakes.stateRoot;
            return failingRegistry(cleanup);
          },
          services: async () => {
            throw primary;
          },
        }),
      );
      const exit = yield* Effect.exit(
        TestApplicationHarness.pipe(
          Effect.provide(
            testApplicationLayer({ env: defineEnv({}) }).pipe(Layer.provide(platform)),
          ),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(
          exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error),
        ).toContain(primary);
        expect(
          exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
        ).toContain(cleanup);
      }
      expect(root).toBeDefined();
      expect(root === undefined || existsSync(root)).toBe(false);
    }),
);

it.effect("keeps successful harness release failures in its public cleanup collection", () =>
  Effect.gen(function* () {
    const cleanup = new Error("selected service release failed");
    const platform = Layer.succeed(
      TestApplicationPlatform,
      TestApplicationPlatform.of({
        artifacts: async () => undefined,
        routes: async () => [],
        providers: async () => undefined,
        services: async () => ({
          context: {},
          close: async () => {
            throw cleanup;
          },
        }),
      }),
    );
    const harness = yield* TestApplicationHarness.pipe(
      Effect.provide(testApplicationLayer({ env: defineEnv({}) }).pipe(Layer.provide(platform))),
    );
    expect(harness.cleanupFailures).toEqual([cleanup]);
  }),
);
