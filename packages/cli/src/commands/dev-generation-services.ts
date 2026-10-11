/** Reconciles generation-local dependencies before bundling and starts workers only after a successful build. */
import { isStableId } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import type { LocalServicePlan } from "@relkit/local-service";
import type { CandidateCompileRequest } from "@relkit/supervisor";
import { Effect, Ref, Scope } from "effect";
import { resolve } from "node:path";
import { cliTry } from "../cli-errors.js";
import {
  checkedLocalArtifacts,
  localPlanFrom,
  reconcileLocalServicesEffect,
} from "./dev-local-services.js";
import { acquireLocalServiceOwnerEffect } from "./dev-local-runtime.js";
import {
  localWorkerArtifacts,
  prepareLocalWorkerOverridesEffect,
} from "./local-service-options.js";
import type { DevCompilerOptions } from "./dev-local.types.js";
import type { DevGenerationState } from "./dev-local-generation.types.js";
import type { DevLocalReconcileResult } from "./dev-local-services.types.js";
import type { CheckResult } from "./check-result.types.js";

/**
 * Updates the accepted integration plan and retains a single local service owner.
 * @param options - Session local-service and backend-port policy.
 * @param state - Shared owner, recipe cache and accepted integration plan.
 * @param checked - Complete accepted compiler cohort.
 * @returns Local reconciliation evidence or absence when no local services are active.
 */
export const reconcileGenerationServices = Effect.fn("Dev.reconcileGeneration")(function* (
  options: DevCompilerOptions,
  state: DevGenerationState,
  checked: CheckResult,
) {
  if (options.localEnabled !== false) {
    const { graph, localPlan, runtimePlan } = yield* cliTry("dev.local.requirements", () =>
      checkedLocalArtifacts(options.projectRoot, checked),
    );
    const oldPlan = yield* Ref.get(state.currentPlan);
    if (oldPlan && oldPlan.graphHash !== runtimePlan.graphHash) yield* state.invalidateEffect;
    yield* Ref.set(state.currentPlan, runtimePlan);
    const required = localPlan.services.filter((entry) => entry.requiredBy.length > 0);
    let selected = yield* Ref.get(state.owner);
    if (required.length || selected) {
      selected ??= yield* acquireGenerationOwner(options, state, graph, required);
      const values = yield* Effect.forEach(
        [...new Set(required.map((entry) => entry.recipe.integrationId))],
        (id) => state.recipes.get(id).pipe(Effect.map((recipe) => [id, recipe] as const)),
        { concurrency: 4 },
      );
      return yield* reconcileLocalServicesEffect(
        checked,
        selected,
        Object.fromEntries(values),
        options.backendPort ?? 3000,
      );
    }
  }

  return undefined;
});

/**
 * Acquires the sole materializer with validated application identity.
 * @param options - Session project root.
 * @param state - Owner reference and its resource lifetime.
 * @param graph - Validated application identity.
 * @param required - Required local binding recipes selecting the materializer.
 * @returns One session owner retained until compiler shutdown.
 */
const acquireGenerationOwner = Effect.fn("Dev.acquireGenerationOwner")(function* (
  options: DevCompilerOptions,
  state: DevGenerationState,
  graph: ApplicationGraph,
  required: LocalServicePlan["services"],
) {
  const materializers = new Set(required.map((entry) => entry.materializerId));
  if (materializers.size > 1)
    return yield* cliTry("dev.local.materializer", () => {
      throw new Error("Local bindings require multiple materializers.");
    });
  const applicationId = yield* cliTry("dev.local.identity", () => {
    if (!isStableId(graph.appId)) throw new Error("Local application identity is invalid.");
    return graph.appId;
  });
  const selected = yield* acquireLocalServiceOwnerEffect(
    options.projectRoot,
    applicationId,
    [...materializers][0] ?? "docker",
  ).pipe(Effect.provideService(Scope.Scope, state.resourceScope));
  yield* Ref.set(state.owner, selected);
  return selected;
});

/**
 * Reconciles built worker artifacts after successful bundling.
 * @param options - Session root and backend port.
 * @param state - Shared success-only recipe cache.
 * @param checked - Accepted compiler cohort.
 * @param request - Candidate build destination.
 * @param local - Reconciliation evidence from before bundling.
 * @returns Worker-ready evidence or unchanged absence/non-worker evidence.
 */
export const activateGenerationWorkers = Effect.fn("Dev.activateGenerationWorkers")(function* (
  options: DevCompilerOptions,
  state: DevGenerationState,
  checked: CheckResult,
  request: CandidateCompileRequest,
  local: DevLocalReconcileResult | undefined,
) {
  if (local === undefined || local.workerBindings.length === 0) return local;
  const override = yield* prepareLocalWorkerOverridesEffect(local.owner.overrideFile);
  const values = yield* Effect.forEach(
    [
      ...new Set(
        localPlanFrom(checked)
          .services.filter((entry) => entry.requiredBy.length)
          .map((entry) => entry.recipe.integrationId),
      ),
    ],
    (id) => state.recipes.get(id).pipe(Effect.map((recipe) => [id, recipe] as const)),
    { concurrency: 4 },
  );
  const artifacts = yield* cliTry("dev.local.workers", () =>
    localWorkerArtifacts(
      localPlanFrom(checked).services,
      local.workerBindings,
      request.outputDirectory,
      resolve(options.projectRoot, "node_modules"),
      override,
    ),
  );
  return yield* reconcileLocalServicesEffect(
    checked,
    local.owner,
    Object.fromEntries(values),
    options.backendPort ?? 3000,
    true,
    artifacts,
  );
});
