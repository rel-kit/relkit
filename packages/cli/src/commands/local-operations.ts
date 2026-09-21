import { join } from "node:path";
import { hashGeneratedArtifact } from "@relkit/compiler";
import { normalizeLocalServiceRecipe } from "@relkit/local-service";
import type { CliCommandContext } from "../main-support.js";
import { buildProject } from "./build.js";
import { loadDevLocalServiceOwner } from "./dev-local-runtime.js";
import {
  localServiceGenerations,
  localJobServiceGenerations,
  localServiceRuntimeOptions,
  prepareLocalWorkerOverrides,
  localWorkerArtifacts,
} from "./local-service-options.js";
import {
  formatServices,
  loadLocalProject,
  loadLocalRecipes,
  oneMaterializer,
  waitForAbort,
} from "./local-operation-support.js";
import { selectPlan } from "./local-plan.js";

export { localStatus, localStop } from "./local-status-stop.js";

export async function localUp(
  projectRoot: string,
  detached: boolean,
  context: Pick<CliCommandContext, "reporter" | "signal">,
  service?: string,
  environment = "development",
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  const localPlan = selectPlan(project.localPlan, service);
  const graph = JSON.parse(project.checked.outputs.graph) as {
    readonly nodes: readonly {
      readonly kind: string;
      readonly profile?: string;
      readonly serviceGeneration?: string;
    }[];
  };
  if (localPlan.services.length === 0) {
    context.reporter.output(
      { ok: true, command: "up", detached, services: [] },
      "No local services.",
    );
    return;
  }
  const materializerId = oneMaterializer(localPlan.services.map((entry) => entry.materializerId));
  const owner = await loadDevLocalServiceOwner(
    project.root,
    project.applicationId,
    materializerId,
    detached ? "detached" : "attached",
  );
  try {
    const recipes = await loadLocalRecipes(
      project.root,
      project.runtimePlan,
      localPlan.services.map((entry) => entry.recipe.integrationId),
    );
    const workerBindings = localPlan.services
      .filter((entry) =>
        normalizeLocalServiceRecipe(recipes[entry.recipe.integrationId]!).units.some(
          (unit) => unit.kind === "worker",
        ),
      )
      .map((entry) => entry.bindingId);
    const initial = await owner.reconciler.reconcile({
      plan: localPlan,
      planHash: hashGeneratedArtifact(project.checked.outputs.localServices),
      recipes,
      scope: "all",
      environment,
      serviceGenerations: localServiceGenerations(
        localPlan.services,
        localJobServiceGenerations(graph),
      ),
      ...localServiceRuntimeOptions(
        localPlan.services,
        Number(process.env.PORT ?? 3000),
        workerBindings.length > 0,
      ),
      signal: context.signal,
    });
    let result = initial;
    if (workerBindings.length > 0) {
      const built = await buildProject({
        projectRoot: project.root,
        providerOverridesGeneration: initial.overrides.generationId,
        check: async () => project.checked,
      });
      if (!built.ok) throw new Error("Unable to build the local worker artifact.");
      const workerOverridesFile = await prepareLocalWorkerOverrides(owner.overrideFile);
      result = await owner.reconciler.reconcile({
        plan: localPlan,
        planHash: hashGeneratedArtifact(project.checked.outputs.localServices),
        recipes,
        scope: "all",
        environment,
        serviceGenerations: localServiceGenerations(
          localPlan.services,
          localJobServiceGenerations(graph),
        ),
        ...localServiceRuntimeOptions(localPlan.services, Number(process.env.PORT ?? 3000), true),
        workerArtifacts: localWorkerArtifacts(
          project.localPlan.services,
          workerBindings,
          built.buildDirectory,
          join(project.root, "node_modules"),
          workerOverridesFile,
        ),
        signal: context.signal,
      });
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
    context.reporter.output(output, formatServices(output.services));
    if (!detached) await waitForAbort(context.signal);
  } finally {
    await owner.close();
  }
}
