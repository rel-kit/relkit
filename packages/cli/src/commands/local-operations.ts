import { join } from "node:path";
import { Effect } from "effect";
import { hashGeneratedArtifact } from "@relkit/compiler";
import { normalizeLocalServiceRecipeEffect } from "@relkit/local-service";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliProject } from "../services/project.service.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import { localCapabilitiesLayer } from "../services/local-capabilities.js";
import { acquireLocalServiceOwnerEffect } from "./dev-local-runtime.js";
import {
  localServiceGenerations,
  localJobServiceGenerations,
  localServiceRuntimeOptions,
  localWorkerArtifacts,
  prepareLocalWorkerOverridesEffect,
} from "./local-service-options.js";
import {
  formatServices,
  loadLocalProjectEffect,
  loadLocalRecipesEffect,
  oneMaterializer,
} from "./local-operation-support.js";
import { selectPlan } from "./local-plan.js";
import type { LocalOperationContext } from "./local.types.js";
export { localStatus, localStop, localStatusEffect, localStopEffect } from "./local-status-stop.js";

/**
 * Reconciles one selected local cohort under an attached or preserved detached lease.
 * @param projectRoot - Authored root.
 * @param detached - Whether containers survive operation cleanup.
 * @param context - Existing reporter.
 * @param service - Optional binding/profile/capability selection.
 * @param environment - Selected local environment.
 * @returns Lazy startup; attached mode remains alive until its fiber is interrupted.
 */
export const localUpEffect = Effect.fn("Local.up")(
  function* (
    projectRoot: string,
    detached: boolean,
    context: LocalOperationContext,
    service?: string,
    environment = "development",
  ) {
    const project = yield* loadLocalProjectEffect(projectRoot);
    const localPlan = yield* cliTry("local.selectPlan", () =>
      selectPlan(project.localPlan, service),
    );
    if (localPlan.services.length === 0) {
      yield* Effect.sync(() =>
        context.reporter.output(
          { ok: true, command: "up", detached, services: [] },
          "No local services.",
        ),
      );
      return;
    }
    const materializerId = yield* cliTry("local.materializer", () =>
      oneMaterializer(localPlan.services.map((entry) => entry.materializerId)),
    );
    const owner = yield* acquireLocalServiceOwnerEffect(
      project.root,
      project.applicationId,
      materializerId,
      detached ? "detached" : "attached",
    );
    const recipes = yield* loadLocalRecipesEffect(
      project.root,
      project.runtimePlan,
      localPlan.services.map((entry) => entry.recipe.integrationId),
    );
    const units = yield* Effect.forEach(
      localPlan.services,
      (entry) =>
        normalizeLocalServiceRecipeEffect(recipes[entry.recipe.integrationId]!).pipe(
          Effect.map((recipe) =>
            recipe.units.some((unit) => unit.kind === "worker") ? [entry.bindingId] : [],
          ),
          Effect.mapError((error) => cliAdapterError("local.recipeValidation", error.cause)),
        ),
      { concurrency: 4 },
    );
    const workerBindings = units.flat();
    const base = yield* cliTry("local.reconcileOptions", () => ({
      plan: localPlan,
      planHash: hashGeneratedArtifact(project.checked.outputs.localServices),
      recipes,
      scope: "all" as const,
      environment,
      serviceGenerations: localServiceGenerations(
        localPlan.services,
        localJobServiceGenerations(project.graph),
      ),
    }));
    const runtimeOptions = yield* cliTry("local.runtimeOptions", () =>
      localServiceRuntimeOptions(localPlan.services, Number(process.env.PORT ?? 3000)),
    );
    const initial = yield* ownedNativePromise("local.reconcile", (signal) =>
      owner.reconciler.reconcile({ ...base, ...runtimeOptions, signal }),
    );
    let result = initial;
    if (workerBindings.length > 0) {
      const projectService = yield* CliProject;
      const built = yield* projectService.build({
        projectRoot: project.root,
        providerOverridesGeneration: initial.overrides.generationId,
        check: async () => project.checked,
      });
      if (!built.ok)
        return yield* cliTry("local.workerBuild", () => {
          throw new Error("Unable to build the local worker artifact.");
        });
      const workerOverridesFile = yield* prepareLocalWorkerOverridesEffect(owner.overrideFile);
      const workers = yield* cliTry("local.workerArtifacts", () => ({
        ...localServiceRuntimeOptions(localPlan.services, Number(process.env.PORT ?? 3000), true),
        workerArtifacts: localWorkerArtifacts(
          project.localPlan.services,
          workerBindings,
          built.buildDirectory,
          join(project.root, "node_modules"),
          workerOverridesFile,
        ),
      }));
      result = yield* ownedNativePromise("local.reconcileWorkers", (signal) =>
        owner.reconciler.reconcile({ ...base, ...workers, signal }),
      );
    }
    const output = {
      ok: true as const,
      command: "up" as const,
      detached,
      applicationId: project.applicationId,
      localProjectId: result.state.localProjectId,
      planHash: result.state.planHash,
      services: result.state.services,
    };
    yield* Effect.sync(() => context.reporter.output(output, formatServices(output.services)));
    if (!detached) yield* Effect.never;
  },
  (
    effect,
    _root: string,
    _detached: boolean,
    _context: LocalOperationContext,
    _service?: string,
    _environment = "development",
  ) => observeCli("local.up", effect),
);

/**
 * Retains standalone startup with scoped lease/container cleanup.
 * @param projectRoot - Authored root.
 * @param detached - Existing lifetime policy.
 * @param context - Reporter and caller signal.
 * @param service - Optional binding selection.
 * @param environment - Local environment.
 * @returns Completion for detached startup, or interruption after attached cleanup.
 */
export function localUp(
  projectRoot: string,
  detached: boolean,
  context: LocalOperationContext,
  service?: string,
  environment = "development",
): Promise<void> {
  return runCliEffect(
    localUpEffect(projectRoot, detached, context, service, environment),
    localCapabilitiesLayer,
    context.signal,
  );
}
