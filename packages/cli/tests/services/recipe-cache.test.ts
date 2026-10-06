import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Ref } from "effect";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceRecipeInput,
} from "@relkit/local-service";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import { makeDevRecipeCacheEffect } from "../../src/commands/dev-recipe-cache.js";
import { CliModules } from "../../src/services/modules.service.js";
import { compilerTestLayer } from "./test-layers.js";

/** Versioned recipe accepted by the owning local-service semantic validator. */
const recipe: LocalServiceRecipeInput = {
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
  integrationId: "redis",
  recipeId: "cache-fixture",
  recipeVersion: 1,
  materializerId: "docker",
  image: `redis:7.4.2-alpine@sha256:${"a".repeat(64)}`,
  ports: { redis: 6379 },
  health: { command: ["redis-cli", "PING"], intervalMs: 250, timeoutMs: 2_000, retries: 40 },
  outputs: () => ({}),
};

/** Exact compiler role substitute; no package resolution occurs in cache tests. */
const roles = compilerTestLayer({
  integrationRole: (input) =>
    Effect.succeed({
      packageName: input.packageName,
      packageVersion: "1.0.0",
      integrationId: input.integrationId,
      exportName: "./local-recipe",
      resolvedPath: "/recipe.ts",
    }),
});

it.effect("recipe invalidation fences old completion and advances the native import query", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const imports: string[] = [];
    const old = { ...recipe, recipeId: "old-recipe" };
    const current = { ...recipe, recipeId: "current-recipe" };
    const modules = Layer.succeed(
      CliModules,
      CliModules.of({
        load: (url) =>
          Effect.gen(function* () {
            imports.push(url);
            if (imports.length === 1) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              return { localRecipe: old };
            }
            return { localRecipe: current };
          }),
        invalidate: () => Effect.void,
      }),
    );
    const plan = yield* Ref.make<RuntimeIntegrationPlan | undefined>({
      version: 1,
      graphHash: "sha256:cohort",
      integrations: [],
    });
    const cache = yield* makeDevRecipeCacheEffect("/project", plan).pipe(
      Effect.provide(Layer.merge(roles, modules)),
    );
    const pending = yield* cache.get("redis").pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* cache.invalidate;
    expect(yield* cache.get("redis")).toBe(current);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(pending);
    expect(yield* cache.get("redis")).toBe(current);
    expect(imports).toHaveLength(2);
    expect(imports[0]).toContain("relkit_epoch=0");
    expect(imports[1]).toContain("relkit_epoch=1");
  }),
);

it.effect("semantic recipe rejection is transient and never poisons a session", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const modules = Layer.succeed(
      CliModules,
      CliModules.of({
        load: () =>
          Effect.sync(() => ({
            localRecipe: ++attempts === 1 ? { ...recipe, ports: { redis: 100_000 } } : recipe,
          })),
        invalidate: () => Effect.void,
      }),
    );
    const plan = yield* Ref.make<RuntimeIntegrationPlan | undefined>({
      version: 1,
      graphHash: "sha256:cohort",
      integrations: [],
    });
    const cache = yield* makeDevRecipeCacheEffect("/project", plan).pipe(
      Effect.provide(Layer.merge(roles, modules)),
    );
    expect(Exit.isFailure(yield* Effect.exit(cache.get("redis")))).toBe(true);
    expect(yield* cache.get("redis")).toBe(recipe);
    expect(yield* cache.get("redis")).toBe(recipe);
    expect(attempts).toBe(2);
  }),
);
