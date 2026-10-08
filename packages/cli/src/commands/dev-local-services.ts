import { assertRuntimeIntegrationPlanVersion, isStableId } from "@relkit/contracts";
import { hashGeneratedArtifact } from "@relkit/compiler";
import { validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import {
  assertLocalServicePlanVersion,
  normalizeLocalServiceRecipeEffect,
  type LocalServicePlan,
  type LocalServiceRecipeInput,
  type LocalServiceWorkerArtifact,
} from "@relkit/local-service";
import { Effect, Layer } from "effect";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import type { CheckResult } from "./check-result.types.js";
import type { EffectLocalServiceOwner } from "./dev-local-runtime.types.js";
import {
  localJobServiceGenerations,
  localServiceGenerations,
  localServiceRuntimeOptions,
} from "./local-service-options.js";
import type { CheckedLocalArtifacts, DevLocalReconcileResult } from "./dev-local-services.types.js";
export type { DevLocalReconcileResult } from "./dev-local-services.types.js";

/**
 * Reconciles accepted recipes through one session-owned lease/reconciler.
 * @param checked - Accepted generation cohort.
 * @param owner - Existing session owner.
 * @param recipes - Success-only session cache results.
 * @param backendPort - Stable backend listener.
 * @param workerEnabled - Whether built workers may now start.
 * @param workerArtifacts - Complete built worker inputs.
 * @returns Inspector/provider override evidence after physical reconciliation settles.
 */
export const reconcileLocalServicesEffect = Effect.fn("Dev.reconcileLocal")(
  function* (
    checked: CheckResult,
    owner: EffectLocalServiceOwner,
    recipes: Readonly<Record<string, LocalServiceRecipeInput>>,
    backendPort: number,
    workerEnabled = false,
    workerArtifacts?: Readonly<Record<string, LocalServiceWorkerArtifact>>,
  ) {
    const { graph, localPlan } = yield* cliTry("dev.local.artifacts", () =>
      checkedLocalArtifacts(checked.projectRoot, checked),
    );
    const required = localPlan.services.filter((entry) => entry.requiredBy.length > 0);
    if (!isStableId(graph.appId) || owner.applicationId !== graph.appId)
      return yield* cliTry("dev.local.identity", () => {
        throw new Error("Local application identity changed.");
      });
    const normalized = yield* Effect.forEach(
      Object.entries(recipes),
      ([id, recipe]) =>
        normalizeLocalServiceRecipeEffect(recipe).pipe(
          Effect.map((result) => [id, result] as const),
          Effect.mapError((error) => cliAdapterError("dev.local.recipe", error.cause)),
        ),
      { concurrency: 4 },
    );
    const accepted = Object.fromEntries(normalized);
    const result = yield* ownedNativePromise("dev.local.reconcile", (signal) =>
      owner.reconciler.reconcile({
        plan: localPlan,
        planHash: hashGeneratedArtifact(checked.outputs.localServices),
        recipes,
        scope: "required",
        environment: "development",
        serviceGenerations: localServiceGenerations(required, localJobServiceGenerations(graph)),
        ...localServiceRuntimeOptions(localPlan.services, backendPort, workerEnabled),
        ...(workerArtifacts === undefined ? {} : { workerArtifacts }),
        signal,
      }),
    );
    const workerBindings = required
      .filter((entry) =>
        accepted[entry.recipe.integrationId]?.units.some((unit) => unit.kind === "worker"),
      )
      .map((entry) => entry.bindingId);
    return {
      owner,
      inspectorState: JSON.stringify({ state: result.state, lease: owner.inspectorLease }),
      ...(required.length === 0 ? {} : { generationId: result.overrides.generationId }),
      workerBindings: Object.freeze(workerBindings),
    } satisfies DevLocalReconcileResult;
  },
  (
    effect,
    _checked: CheckResult,
    _owner: EffectLocalServiceOwner,
    _recipes: Readonly<Record<string, LocalServiceRecipeInput>>,
    _port: number,
    _enabled = false,
    _artifacts?: Readonly<Record<string, LocalServiceWorkerArtifact>>,
  ) => observeCli("dev.local.reconcile", effect),
);

/**
 * Applies the owning graph/local/integration validators before accepted artifact use.
 * @param projectRoot - Source evidence root.
 * @param checked - Complete validated check transport.
 * @returns One graph-coherent artifact cohort.
 * @remarks The graph cast is confined to the existing owner validator's typed input.
 */
export function checkedLocalArtifacts(
  projectRoot: string,
  checked: CheckResult,
): CheckedLocalArtifacts {
  const graph = JSON.parse(checked.outputs.graph) as ApplicationGraph;
  validateGraphShape(graph, projectRoot);
  const localPlan: unknown = JSON.parse(checked.outputs.localServices);
  const runtimePlan: unknown = JSON.parse(checked.outputs.runtimeIntegrations);
  assertLocalServicePlanVersion(localPlan);
  assertRuntimeIntegrationPlanVersion(runtimePlan);
  if (localPlan.graphHash !== checked.graphHash || runtimePlan.graphHash !== checked.graphHash)
    throw new Error("Local development artifacts do not match the application graph.");
  return { graph, localPlan, runtimePlan };
}
/** Validates the local plan supplied by accepted compiler evidence.
 * @param checked - Accepted check evidence.
 * @returns Owner-validated local plan.
 */
export function localPlanFrom(checked: CheckResult): LocalServicePlan {
  const plan: unknown = JSON.parse(checked.outputs.localServices);
  assertLocalServicePlanVersion(plan);
  return plan;
}
