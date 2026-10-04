import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import { existsSync } from "node:fs";
import { defineEnv } from "@relkit/config";
import type { ProviderRegistry } from "@relkit/engine";
import {
  TestApplicationHarness,
  TestApplicationPlatform,
  testApplicationLayer,
} from "../../src/application.js";

it.effect("releases acquired providers and runtime roots when service activation fails", () =>
  Effect.gen(function* () {
    const sentinel = new Error("auth startup");
    const order: string[] = [];
    let root: string | undefined;
    const registry: ProviderRegistry = {
      generationId: "test",
      requirements: [],
      handles: {},
      get: () => undefined,
      resolve: () => {
        throw new Error("No fixture provider");
      },
      release: async () => {
        order.push("providers");
      },
      dispose: async () => undefined,
    };
    const platform = Layer.succeed(
      TestApplicationPlatform,
      TestApplicationPlatform.of({
        artifacts: async () => undefined,
        routes: async () => [],
        providers: async (_artifacts, _providers, _bindings, fakes) => {
          root = fakes.stateRoot;
          return registry;
        },
        services: async () => {
          throw sentinel;
        },
      }),
    );
    const acquired = yield* Effect.exit(
      TestApplicationHarness.pipe(
        Effect.provide(testApplicationLayer({ env: defineEnv({}) }).pipe(Layer.provide(platform))),
      ),
    );
    expect(Exit.isFailure(acquired)).toBe(true);
    if (Exit.isFailure(acquired)) expect(Cause.squash(acquired.cause)).toBe(sentinel);
    expect(order).toEqual(["providers"]);
    expect(root).toBeDefined();
    expect(existsSync(root!)).toBe(false);
  }),
);

it.effect("validates explicit runtime options before loading or acquiring project resources", () =>
  Effect.gen(function* () {
    let loads = 0;
    const platform = Layer.succeed(
      TestApplicationPlatform,
      TestApplicationPlatform.of({
        artifacts: async () => {
          loads++;
          return undefined;
        },
        routes: async () => [],
        providers: async () => undefined,
        services: async () => ({ context: {}, close: async () => undefined }),
      }),
    );
    const acquired = yield* Effect.exit(
      TestApplicationHarness.pipe(
        Effect.provide(
          testApplicationLayer({ env: defineEnv({}) }, { startTimeMs: Number.NaN }).pipe(
            Layer.provide(platform),
          ),
        ),
      ),
    );
    expect(Exit.isFailure(acquired)).toBe(true);
    if (Exit.isFailure(acquired))
      expect(String(Cause.squash(acquired.cause))).toContain("startTimeMs must be finite");
    expect(loads).toBe(0);
  }),
);
