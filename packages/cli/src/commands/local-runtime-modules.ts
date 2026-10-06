import { pathToFileURL } from "node:url";
import { Effect, Layer, Schema } from "effect";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import {
  normalizeLocalServiceRecipeEffect,
  type LocalServiceRecipeInput,
} from "@relkit/local-service";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { localRuntimeSchema, dockerRuntimeSchema } from "./local-runtime-modules.schemas.js";
import { localRecipeSchema } from "./local-recipe.schemas.js";
import type { LoadedLocalRuntimeModules } from "./local-runtime-modules.types.js";
export type {
  LoadedLocalIdentity,
  LoadedLocalLease,
  LoadedLocalReconciler,
  LoadedLocalRuntime,
  LoadedLocalRuntimeModules,
} from "./local-runtime-modules.types.js";

/**
 * Loads only the declared local orchestration and materializer SDK exports.
 * @param projectRoot - Package resolution root.
 * @param materializerId - Selected materializer; only Docker is currently supported.
 * @returns Original native namespaces with validated callability, requiring compiler/import authority.
 */
export const loadLocalRuntimeModulesEffect = Effect.fn("Local.loadRuntimeModules")(
  function* (projectRoot: string, materializerId: string) {
    if (materializerId !== "docker")
      return yield* cliTry("local.materializer", () => {
        throw new Error(`Unsupported local materializer: ${materializerId}`);
      });
    const compiler = yield* CliCompiler;
    const modules = yield* CliModules;
    const [localRole, materializerRole] = yield* Effect.all(
      [
        compiler.integrationRole({
          projectRoot,
          packageName: "@relkit/local",
          integrationId: "local",
          role: "localService",
        }),
        compiler.integrationRole({
          projectRoot,
          packageName: "@relkit/docker",
          integrationId: "docker",
          role: "localMaterializer",
        }),
      ],
      { concurrency: 2 },
    );
    const [localModule, materializerModule] = yield* Effect.all(
      [
        modules.load(pathToFileURL(localRole.resolvedPath).href),
        modules.load(pathToFileURL(materializerRole.resolvedPath).href),
      ],
      { concurrency: 2 },
    );
    return yield* cliTry("local.runtimeExports", () => {
      if (
        !Schema.is(localRuntimeSchema)(localModule) ||
        !Schema.is(dockerRuntimeSchema)(materializerModule)
      )
        throw new Error("Local integration runtime exports are invalid.");
      return Object.freeze({
        local: localModule,
        materializer: materializerModule.createDockerMaterializer(),
      }) satisfies LoadedLocalRuntimeModules;
    });
  },
  (effect, _projectRoot: string, _materializerId: string) =>
    observeCli("local.loadRuntimeModules", effect),
);

/**
 * Resolves and validates one recipe under its accepted graph/import epoch.
 * @param projectRoot - Package resolution root.
 * @param runtimePlan - Compiler-owned integration cohort.
 * @param integrationId - Selected recipe owner.
 * @param epoch - Optional session import generation after source/configuration edits.
 * @returns A native recipe after structural and owner semantic validation.
 */
export const loadLocalRecipeEffect = Effect.fn("Local.loadRecipe")(
  function* (
    projectRoot: string,
    runtimePlan: RuntimeIntegrationPlan,
    integrationId: string,
    epoch?: string,
  ) {
    const compiler = yield* CliCompiler;
    const modules = yield* CliModules;
    const selected = runtimePlan.integrations.find(
      (entry) => entry.integrationId === integrationId,
    );
    const selectedRole = yield* compiler.integrationRole({
      projectRoot,
      packageName: selected?.packageName ?? `@relkit/${integrationId}`,
      integrationId,
      role: "localRecipe",
    });
    const module = yield* modules.load(
      `${pathToFileURL(selectedRole.resolvedPath).href}?relkit_recipe=${encodeURIComponent(runtimePlan.graphHash)}${epoch === undefined ? "" : `&relkit_epoch=${encodeURIComponent(epoch)}`}`,
    );
    const recipe = yield* cliTry("local.recipeExports", () => {
      if (module.localRecipe === undefined)
        throw new Error(`Local recipe export for "${integrationId}" is unavailable.`);
      if (!Schema.is(localRecipeSchema)(module.localRecipe))
        throw new TypeError("Local-service recipe is invalid.");
      return module.localRecipe;
    });
    yield* normalizeLocalServiceRecipeEffect(recipe).pipe(
      Effect.mapError((error) => cliAdapterError("local.recipeValidation", error.cause)),
    );
    return recipe satisfies LocalServiceRecipeInput;
  },
  (
    effect,
    _projectRoot: string,
    _runtimePlan: RuntimeIntegrationPlan,
    _integrationId: string,
    _epoch?: string,
  ) => observeCli("local.loadRecipe", effect),
);

/**
 * Retains standalone module loading at one public Promise edge.
 * @param projectRoot - Package resolution root.
 * @param materializerId - Selected Docker materializer.
 * @returns Accepted native handles after the invocation lifetime.
 */
export function loadLocalRuntimeModules(
  projectRoot: string,
  materializerId: string,
): Promise<LoadedLocalRuntimeModules> {
  return runCliEffect(
    loadLocalRuntimeModulesEffect(projectRoot, materializerId),
    Layer.merge(compilerLayer, moduleLayer),
  );
}

/**
 * Retains standalone recipe loading without a process-global cache.
 * @param projectRoot - Package resolution root.
 * @param runtimePlan - Accepted integration cohort.
 * @param integrationId - Recipe owner.
 * @returns The validated original recipe object.
 */
export function loadLocalRecipe(
  projectRoot: string,
  runtimePlan: RuntimeIntegrationPlan,
  integrationId: string,
): Promise<LocalServiceRecipeInput> {
  return runCliEffect(
    loadLocalRecipeEffect(projectRoot, runtimePlan, integrationId),
    Layer.merge(compilerLayer, moduleLayer),
  );
}
