import { randomUUID } from "node:crypto";
import { hashGeneratedArtifact } from "@relkit/compiler";
import type { LocalServiceInstance } from "@relkit/local-service";
import { normalizeLocalServiceRecipe } from "@relkit/local-service";
import type { CliCommandContext } from "../main-support.js";
import { buildProject } from "./build.js";
import { loadDevLocalServiceOwner } from "./dev-local-runtime.js";
import { localServiceRuntimeOptions, localWorkerArtifacts } from "./local-service-options.js";
import { loadLocalRuntimeModules } from "./local-runtime-modules.js";
import {
  formatServices,
  loadLocalProject,
  loadLocalRecipes,
  oneMaterializer,
  processAlive,
  waitForAbort,
} from "./local-operation-support.js";

export async function localUp(
  projectRoot: string,
  detached: boolean,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  if (project.localPlan.services.length === 0) {
    context.reporter.output(
      { ok: true, command: "up", detached, services: [] },
      "No local services.",
    );
    return;
  }
  const materializerId = oneMaterializer(
    project.localPlan.services.map((entry) => entry.materializerId),
  );
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
      project.localPlan.services.map((entry) => entry.recipe.integrationId),
    );
    const initial = await owner.reconciler.reconcile({
      plan: project.localPlan,
      planHash: hashGeneratedArtifact(project.checked.outputs.localServices),
      recipes,
      scope: "all",
      environment: "development",
      serviceGeneration: hashGeneratedArtifact(project.checked.outputs.graph),
      ...localServiceRuntimeOptions(project.localPlan.services, Number(process.env.PORT ?? 3000)),
      signal: context.signal,
    });
    const workerBindings = project.localPlan.services
      .filter((entry) => normalizeLocalServiceRecipe(recipes[entry.recipe.integrationId]!).units.some((unit) => unit.kind === "worker"))
      .map((entry) => entry.bindingId);
    let result = initial;
    if (workerBindings.length > 0) {
      const built = await buildProject({
        projectRoot: project.root,
        providerOverridesGeneration: initial.overrides.generationId,
        check: async () => project.checked,
      });
      if (!built.ok) throw new Error("Unable to build the local worker artifact.");
      result = await owner.reconciler.reconcile({
        plan: project.localPlan,
        planHash: hashGeneratedArtifact(project.checked.outputs.localServices),
        recipes,
        scope: "all",
        environment: "development",
        serviceGeneration: hashGeneratedArtifact(project.checked.outputs.graph),
        ...localServiceRuntimeOptions(project.localPlan.services, Number(process.env.PORT ?? 3000), true),
        workerArtifacts: localWorkerArtifacts(
          project.localPlan.services,
          workerBindings,
          built.buildDirectory,
          owner.overrideFile,
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

export async function localStatus(
  projectRoot: string,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  const materializerId = oneMaterializer(
    project.localPlan.services.map((entry) => entry.materializerId),
  );
  const { local, materializer } = await loadLocalRuntimeModules(project.root, materializerId);
  const identity = local.createLocalProjectIdentity(project.root, project.applicationId);
  const [containers, state] = await Promise.all([
    materializer.list(local.localProjectLabels(identity), context.signal),
    Promise.resolve(local.readLocalServiceState(identity)),
  ]);
  const lease = local.readLocalProjectLease(identity);
  const grouped = local.groupServiceInstances(containers);
  const byBinding = new Map(
    grouped.map((container) => [container.labels["dev.relkit.binding-id"], container]),
  );
  const prior = new Map(state?.services.map((service) => [service.bindingId, service]));
  const services = project.localPlan.services.map((entry) => {
    const container = byBinding.get(entry.bindingId);
    const expectedUnits = prior.get(entry.bindingId)?.units;
    const actualUnits = container?.units?.map((unit) => unit.unitId);
    const incomplete = expectedUnits !== undefined && actualUnits !== undefined &&
      (expectedUnits.length !== actualUnits.length || expectedUnits.some((unit) => !actualUnits.includes(unit)));
    return {
      bindingId: entry.bindingId,
      recipe: entry.recipe,
      phase: incomplete ? "unhealthy" : container?.health ?? prior.get(entry.bindingId)?.phase ?? "stopped",
      ...(container === undefined ? {} : { containerState: container.state }),
    };
  });
  const output = {
    ok: true as const,
    command: "status" as const,
    applicationId: identity.applicationId,
    localProjectId: identity.localProjectId,
    planHash: state?.planHash ?? hashGeneratedArtifact(project.checked.outputs.localServices),
    ownership:
      lease === undefined
        ? undefined
        : {
            mode: lease.mode,
            sessionId: lease.sessionId,
            blocked: lease.mode === "attached" && processAlive(lease.ownerPid),
          },
    services,
  };
  context.reporter.output(output, formatServices(services));
}

export async function localStop(
  projectRoot: string,
  reset: boolean,
  context: Pick<CliCommandContext, "reporter" | "signal">,
  dryRun = false,
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  const materializerId = oneMaterializer(
    project.localPlan.services.map((entry) => entry.materializerId),
  );
  const { local, materializer } = await loadLocalRuntimeModules(project.root, materializerId);
  const identity = local.createLocalProjectIdentity(project.root, project.applicationId);
  const labels = local.localProjectLabels(identity);
  let existing: readonly LocalServiceInstance[] = [];
  let volumes: readonly { readonly name: string }[] = [];
  if (dryRun) {
    existing = await materializer.list(labels, context.signal);
    volumes = reset
      ? (await materializer.listVolumes?.(labels, context.signal)) ?? []
      : [];
    const output = {
      ok: true as const,
      command: "reset" as const,
      dryRun: true as const,
      localProjectId: identity.localProjectId,
      containers: existing.length,
      containerNames: existing.map((container) => container.name).sort(),
      volumes: volumes.map((volume) => volume.name).sort(),
      volumesWouldRemove: true,
      volumesRemoved: false,
    };
    context.reporter.output(output, `Would reset ${existing.length} local container${existing.length === 1 ? "" : "s"}.`);
    return;
  }
  const handle = local.acquireLocalProjectLease(identity, {
    mode: "attached",
    sessionId: `local-${reset ? "reset" : "stop"}-${randomUUID()}`,
  });
  try {
    existing = await materializer.list(labels, context.signal);
    for (const service of local.groupServiceInstances(existing)) {
      for (const id of [...local.serviceInstanceIds(service)].reverse()) {
        if (materializer.stop !== undefined) await materializer.stop(id, context.signal).catch(() => undefined);
        await materializer.remove(id, context.signal);
      }
    }
    if (reset) await materializer.removeVolumes(labels, context.signal);
    if (reset) await materializer.removeNetworks?.(labels, context.signal);
    for (const name of [
      "provider-overrides.json",
      "local-services.state.json",
      "lease.json",
      "local-secrets.json",
    ] as const) {
      local.removeLocalStateFile(identity, name);
    }
  } finally {
    handle.release();
  }
  const output = {
    ok: true as const,
    command: reset ? ("reset" as const) : ("stop" as const),
    localProjectId: identity.localProjectId,
    containers: existing.length,
    volumesRemoved: reset,
  };
  context.reporter.output(
    output,
    `${reset ? "Reset" : "Stopped"} ${existing.length} local container${existing.length === 1 ? "" : "s"}.`,
  );
}
