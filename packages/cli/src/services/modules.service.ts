import { Cache, Context, Duration, Effect, Exit, Layer, Ref, Schema } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { ModuleCapabilities } from "./modules.types.js";
import { moduleNamespaceSchema } from "./modules.schemas.js";

/** Dynamic imports whose lifetime and success cache belong to the invoking session. */
export class CliModules extends Context.Service<CliModules, ModuleCapabilities>()(
  "relkit/cli/Modules",
) {}

/**
 * Imports and validates one namespace without starting a runtime or retaining failed imports.
 * @param specifier - Resolved module URL, including the caller's generation query when needed.
 * @returns A validated namespace in the adapter failure channel.
 */
const loadModule = Effect.fn("CliModules.load")(function* (specifier: string) {
  const value: unknown = yield* cliPromise("modules.load", () => import(specifier));
  return yield* cliTry("modules.namespace", () => {
    if (!Schema.is(moduleNamespaceSchema)(value))
      throw new TypeError("Imported module is not a namespace.");
    return value;
  });
});

/** Uncached invocation imports; Bun's native module identity remains unchanged. */
export const moduleLayer = Layer.succeed(
  CliModules,
  CliModules.of({
    load: (specifier) => observeCli("modules.load", loadModule(specifier)),
    invalidate: () => observeCli("modules.invalidate", Effect.void),
  }),
);

/**
 * Acquires a bounded success-only cache for one dev session.
 * @param load - Narrow import adapter, replaced by deterministic test lookups.
 * @returns A Layer whose imports deduplicate concurrent loads and can invalidate after edits.
 * @remarks Failed and interrupted lookups have zero lifetime; no cache crosses sessions.
 */
export function makeSessionModuleLayer(load: ModuleCapabilities["load"]): Layer.Layer<CliModules> {
  return Layer.effect(
    CliModules,
    Effect.gen(function* () {
      const makeCache = Cache.makeWith(load, {
        capacity: 256,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
      });
      const current = yield* Ref.make(yield* makeCache);
      return CliModules.of({
        load: Effect.fn("CliModules.cachedLoad")((specifier: string) =>
          observeCli(
            "modules.load",
            Ref.get(current).pipe(Effect.flatMap((cache) => Cache.get(cache, specifier))),
          ),
        ),
        invalidate: Effect.fn("CliModules.invalidate")(() =>
          observeCli(
            "modules.invalidate",
            makeCache.pipe(Effect.flatMap((cache) => Ref.set(current, cache))),
          ),
        ),
      });
    }),
  );
}

/** Session imports use the native adapter; tests substitute only that boundary. */
export const sessionModuleLayer = makeSessionModuleLayer(loadModule);
