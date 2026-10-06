import { Cache, Duration, Effect, Exit, Ref } from "effect";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCompiler } from "../services/compiler.service.js";
import { CliModules } from "../services/modules.service.js";
import { loadLocalRecipeEffect } from "./local-runtime-modules.js";
import type { DevRecipeCache } from "./dev-recipe-cache.types.js";

/**
 * Captures recipe imports in a replaceable success-only session cache.
 * @param projectRoot - Authored package resolution root.
 * @param currentPlan - Accepted compiler integration cohort.
 * @returns A native cache owner with fresh import epochs after source/configuration edits.
 * @remarks Replacing the Cache prevents late completion in an old instance from
 * overwriting a newer value, including Effect 4.0.1's pending invalidation race.
 */
export const makeDevRecipeCacheEffect = Effect.fn("Dev.recipeCache")(
  function* (projectRoot: string, currentPlan: Ref.Ref<RuntimeIntegrationPlan | undefined>) {
    const compiler = yield* CliCompiler;
    const modules = yield* CliModules;
    const epoch = yield* Ref.make(0);
    const makeCache = Cache.makeWith(
      (integrationId: string) =>
        Effect.gen(function* () {
          const plan = yield* Ref.get(currentPlan);
          if (!plan)
            return yield* cliTry("dev.recipe.plan", () => {
              throw new Error("Local recipe lookup has no accepted integration plan.");
            });
          return yield* loadLocalRecipeEffect(
            projectRoot,
            plan,
            integrationId,
            String(yield* Ref.get(epoch)),
          ).pipe(
            Effect.provideService(CliCompiler, compiler),
            Effect.provideService(CliModules, modules),
          );
        }),
      {
        capacity: 128,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
      },
    );
    const current = yield* Ref.make(yield* makeCache);
    return {
      get: (id) =>
        observeCli(
          "dev.recipe.load",
          Ref.get(current).pipe(Effect.flatMap((cache) => Cache.get(cache, id))),
        ),
      invalidate: observeCli(
        "dev.recipe.invalidate",
        Effect.uninterruptible(
          Ref.update(epoch, (value) => value + 1).pipe(
            Effect.andThen(makeCache),
            Effect.flatMap((cache) => Ref.set(current, cache)),
            Effect.andThen(modules.invalidate()),
          ),
        ),
      ),
    } satisfies DevRecipeCache;
  },
  (effect, _root: string, _plan: Ref.Ref<RuntimeIntegrationPlan | undefined>) =>
    observeCli("dev.recipe.acquire", effect),
);
