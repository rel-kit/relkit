import {
  assertRuntimeIntegrationPlanVersion,
  isStableId,
  type RuntimeIntegrationPlan,
} from "@relkit/contracts";
import { hashGeneratedArtifact } from "@relkit/compiler";
import {
  assertLocalServicePlanVersion,
  type LocalServicePlan,
  type LocalServiceRecipe,
} from "@relkit/local-service";
import { validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import type { CandidateCompile, CandidateCompileRequest } from "@relkit/supervisor";
import { buildProject } from "./build.js";
import { checkProject, type CheckResult } from "./check.js";
import {
  loadDevLocalServiceOwner,
  loadLocalRecipe,
  type DevLocalServiceOwner,
} from "./dev-local-runtime.js";
import type { TelemetryConfiguration } from "@relkit/observability";

export interface DevLocalCompiler {
  readonly compile: CandidateCompile;
  readonly close: () => Promise<void>;
}

export function createDevLocalCompiler(
  projectRoot: string,
  localEnabled = true,
  configureTelemetry?: (configuration: TelemetryConfiguration) => Promise<void> | undefined,
): DevLocalCompiler {
  let owner: DevLocalServiceOwner | undefined;
  const recipes = new Map<string, LocalServiceRecipe>();
  return Object.freeze({
    compile: async (request: CandidateCompileRequest) => {
      const checked = await checkProject({
        projectRoot,
        mode: "development",
        generationId: `dev-${request.token.sourceToken}-${request.token.generationToken}`,
        signal: request.signal,
      });
      if (!checked.ok) throw new Error(messages(checked));
      if (configureTelemetry) {
        const graph = JSON.parse(checked.outputs.graph) as {
          nodes: { kind: string; telemetry?: TelemetryConfiguration }[];
        };
        await configureTelemetry(graph.nodes.find((node) => node.kind === "app")?.telemetry ?? {});
      }
      const local = localEnabled
        ? await reconcile(projectRoot, checked, recipes, owner, request.signal)
        : undefined;
      owner = local?.owner ?? owner;
      const built = await buildProject({
        projectRoot,
        mode: "development",
        buildDirectory: request.outputDirectory,
        signal: request.signal,
        check: async () => checked,
        ...(local?.generationId === undefined
          ? {}
          : { providerOverridesGeneration: local.generationId }),
      });
      if (!built.ok) throw new Error(built.diagnostics.map((entry) => entry.message).join("\n"));
      return {
        entrypoint: "server/index.js",
        ...(local === undefined
          ? {}
          : {
              environment: {
                RELKIT_LOCAL_SERVICE_INSPECTOR_STATE: local.inspectorState,
                ...(local.generationId === undefined
                  ? {}
                  : { RELKIT_PROVIDER_OVERRIDES_FILE: local.owner.overrideFile }),
              },
            }),
      };
    },
    close: async () => owner?.close(),
  });
}

async function reconcile(
  projectRoot: string,
  checked: CheckResult,
  recipes: Map<string, LocalServiceRecipe>,
  current: DevLocalServiceOwner | undefined,
  signal: AbortSignal,
): Promise<
  | {
      owner: DevLocalServiceOwner;
      inspectorState: string;
      generationId?: string;
    }
  | undefined
> {
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
      if (!recipes.has(integrationId))
        recipes.set(integrationId, await loadLocalRecipe(projectRoot, runtimePlan, integrationId));
    }),
  );
  const result = await owner.reconciler.reconcile({
    plan: localPlan,
    planHash: hashGeneratedArtifact(checked.outputs.localServices),
    recipes: Object.fromEntries(recipes),
    scope: "required",
    signal,
  });
  return {
    owner,
    inspectorState: JSON.stringify({ state: result.state, lease: owner.inspectorLease }),
    ...(required.length === 0 ? {} : { generationId: result.overrides.generationId }),
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
  if (localPlan.graphHash !== checked.graphHash || runtimePlan.graphHash !== checked.graphHash)
    throw new Error("Local development artifacts do not match the application graph.");
  return { graph, localPlan, runtimePlan };
}

function messages(checked: CheckResult): string {
  return checked.diagnostics.map((entry) => entry.message).join("\n") || "Project check failed.";
}
