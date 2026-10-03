import { Context, Effect, Layer } from "effect";
import { createContextEffect } from "./context.js";
import { buildDependencyClientsEffect } from "./dependencies.js";
import { createFunctionRegistryEffect } from "./registry.js";
import type { DependencyOperations, FunctionRegistryOperations } from "./registry.service.types.js";

/** Verified graph/manifest authority, replaceable in composition tests. */
export class FunctionRegistryService extends Context.Service<
  FunctionRegistryService,
  FunctionRegistryOperations
>()("@relkit/engine/FunctionRegistry") {}

/** Declared client/context construction authority.
 * @example
 * ```ts
 * const clients = await Effect.runPromise(Effect.gen(function* () {
 *   return yield* (yield* DependencyService).clients({ ownerId: "orders.test" });
 * }).pipe(Effect.provide(DependencyLive)));
 * ```
 * @remarks The guarded empty-client example is checked in tests/domain-layers.test.ts.
 */
export class DependencyService extends Context.Service<DependencyService, DependencyOperations>()(
  "@relkit/engine/Dependencies",
) {}

/** Live graph/manifest verification, preserving immutable registry behavior. */
export const FunctionRegistryLive = Layer.effect(
  FunctionRegistryService,
  Effect.gen(function* () {
    return FunctionRegistryService.of({ create: createFunctionRegistryEffect });
  }),
);

/** Live declared-client construction; external provider methods stay behind adapters. */
export const DependencyLive = Layer.effect(
  DependencyService,
  Effect.gen(function* () {
    return DependencyService.of({
      clients: buildDependencyClientsEffect,
      context: createContextEffect,
    });
  }),
);
