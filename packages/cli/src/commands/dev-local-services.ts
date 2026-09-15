import {
  assertRuntimeIntegrationPlanVersion,
  isStableId,
  type RuntimeIntegrationPlan,
} from "@relkit/contracts";
import { hashGeneratedArtifact } from "@relkit/compiler";
import { validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import {
  assertLocalServicePlanVersion,
  normalizeLocalServiceRecipe,
  type LocalServicePlan,
  type LocalServiceRecipeInput,
  type LocalServiceWorkerArtifact,
} from "@relkit/local-service";
import type { CandidateCompileRequest } from "@relkit/supervisor";
import type { CheckResult } from "./check.js";
import {
  loadDevLocalServiceOwner,
  loadLocalRecipe,
  type DevLocalServiceOwner,
} from "./dev-local-runtime.js";
import { localServiceRuntimeOptions } from "./local-service-options.js";

export interface DevLocalReconcileResult {
  readonly owner: DevLocalServiceOwner;
  readonly inspectorState: string;
  readonly generationId?: string;
  readonly workerBindings: readonly string[];
}

export async function reconcileLocalServices(
  projectRoot: string,
  checked: CheckResult,
  recipes: Map<string, LocalServiceRecipeInput>,
  current: DevLocalServiceOwner | undefined,
  request: Pick<CandidateCompileRequest, "signal">,
  backendPort: number,
  workerEnabled = false,
  workerArtifacts?: Readonly<Record<string, LocalServiceWorkerArtifact>>,
): Promise<DevLocalReconcileResult | undefined> {
  const { graph, localPlan, runtimePlan } = checkedLocalArtifacts(projectRoot, checked);
  const required = localPlan.services.filter((entry) => {
    if (!Array.isArray(entry.requiredBy)) throw new Error("Local-service plan is invalid.");
    return entry.requiredBy.length > 0;
  });
  if (required.length === 0 && current === undefined) return undefined;
  const applicationId = graph.appId;
  if (!isStableId(applicationId)) throw new Error("Local application identity is invalid.");
  const materializers = new Set(required.map((entry) => entry.materializerId));
  if (materializers.size > 1) throw new Error("Local bindings require multiple materializers.");
  const materializerId = [...materializers][0] ?? "docker";
  const owner =
    current ?? (await loadDevLocalServiceOwner(projectRoot, applicationId, materializerId));
  if (owner.applicationId !== applicationId) throw new Error("Local application identity changed.");
  await Promise.all(
    [...new Set(required.map((entry) => entry.recipe.integrationId))].map(async (integrationId) => {
      if (!recipes.has(integrationId)) {
        recipes.set(integrationId, await loadLocalRecipe(projectRoot, runtimePlan, integrationId));
      }
    }),
  );
  const result = await owner.reconciler.reconcile({
    plan: localPlan,
    planHash: hashGeneratedArtifact(checked.outputs.localServices),
    recipes: Object.fromEntries(recipes),
    scope: "required",
    environment: "development",
    serviceGeneration: hashGeneratedArtifact(checked.outputs.graph),
    ...localServiceRuntimeOptions(localPlan.services, backendPort, workerEnabled),
    ...(workerArtifacts === undefined ? {} : { workerArtifacts }),
    signal: request.signal,
  });
  const workerBindings = required
    .filter((entry) =>
      normalizeRecipe(recipes.get(entry.recipe.integrationId)!).some(
        (unit) => unit.kind === "worker",
      ),
    )
    .map((entry) => entry.bindingId);
  return {
    owner,
    inspectorState: JSON.stringify({ state: result.state, lease: owner.inspectorLease }),
    ...(required.length === 0 ? {} : { generationId: result.overrides.generationId }),
    workerBindings: Object.freeze(workerBindings),
  };
}

export function checkedLocalArtifacts(
  projectRoot: string,
  checked: CheckResult,
): {
  graph: ApplicationGraph;
  localPlan: LocalServicePlan;
  runtimePlan: RuntimeIntegrationPlan;
} {
  const graph = JSON.parse(checked.outputs.graph) as ApplicationGraph;
  validateGraphShape(graph, projectRoot);
  const localPlan = JSON.parse(checked.outputs.localServices) as unknown;
  const runtimePlan = JSON.parse(checked.outputs.runtimeIntegrations) as unknown;
  assertLocalServicePlanVersion(localPlan);
  assertRuntimeIntegrationPlanVersion(runtimePlan);
  if (localPlan.graphHash !== checked.graphHash || runtimePlan.graphHash !== checked.graphHash) {
    throw new Error("Local development artifacts do not match the application graph.");
  }
  return { graph, localPlan, runtimePlan };
}

export function localPlanFrom(checked: CheckResult): LocalServicePlan {
  return JSON.parse(checked.outputs.localServices) as LocalServicePlan;
}

function normalizeRecipe(recipe: LocalServiceRecipeInput) {
  return normalizeLocalServiceRecipe(recipe).units;
}
