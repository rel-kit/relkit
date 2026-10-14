/**
 * Owns one prepared check's TypeScript input journal and isolated host policy.
 * Native callbacks borrow its private state only while TypeScript runs. Evidence
 * is an observed Effect operation and rejects inconsistent or unsafe observations;
 * ordinary checks without this optional service retain their established host.
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { installedDependencyAliases } from "./typecheck-inputs-aliases.js";
import { Context, Effect, Layer } from "effect";
import { observeCompiler } from "./observability.js";
import { TypecheckInputError } from "./typecheck-inputs-error.js";
import { typecheckInputHost, typecheckInputSystem } from "./typecheck-inputs-native.js";
import type { TypecheckInputOperations, TypecheckInputState } from "./typecheck-inputs.types.js";

/** Prepared checking explicitly supplies a fresh journal for each compilation. */
export class TypecheckInputs extends Context.Service<TypecheckInputs, TypecheckInputOperations>()(
  "relkit/compiler/TypecheckInputs",
  {
    make: (root: string) =>
      Effect.gen(function* () {
        const physicalRoot = yield* Effect.try({
          try: () => realpathSync(root),
          catch: (cause) =>
            new TypecheckInputError({
              reason: "unavailable",
              cause: new Error("Cannot acquire compiler input root", { cause }),
            }),
        });
        const state: TypecheckInputState = {
          root: resolve(root),
          physicalRoot,
          dependencyAliases: installedDependencyAliases(resolve(root)),
          witnesses: new Map(),
          failure: undefined,
        };
        const system = typecheckInputSystem(state);
        const evidence = Effect.suspend(() => {
          if (state.failure !== undefined)
            return Effect.fail(new TypecheckInputError({ reason: state.failure }));
          return Effect.succeed(
            [...state.witnesses.values()].sort((left, right) =>
              `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`),
            ),
          );
        });
        return {
          system,
          host: (options) => typecheckInputHost(state, system, options),
          evidence: observeCompiler("configuration", "typecheckInputs", evidence, () => ({
            entries: state.witnesses.size,
          })),
        } satisfies TypecheckInputOperations;
      }),
  },
) {}

/**
 * Supplies one native or fixture project journal through the same service contract.
 * @param root - Physical prepared project's root before any config/source parsing.
 * @returns A check-owned Layer; constructing it registers no listeners or workers.
 */
export function typecheckInputsLayer(root: string) {
  return Layer.effect(TypecheckInputs, TypecheckInputs.make(root));
}
