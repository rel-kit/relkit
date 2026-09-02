import { randomUUID } from "node:crypto";
import { hashGeneratedArtifact } from "@relkit/compiler";
import type { CliCommandContext } from "../main-support.js";
import { loadDevLocalServiceOwner } from "./dev-local-runtime.js";
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
    const result = await owner.reconciler.reconcile({
      plan: project.localPlan,
      planHash: hashGeneratedArtifact(project.checked.outputs.localServices),
      recipes,
      scope: "all",
      signal: context.signal,
    });
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
  const byBinding = new Map(
    containers.map((container) => [container.labels["dev.relkit.binding-id"], container]),
  );
  const prior = new Map(state?.services.map((service) => [service.bindingId, service]));
  const services = project.localPlan.services.map((entry) => {
    const container = byBinding.get(entry.bindingId);
    return {
      bindingId: entry.bindingId,
      recipe: entry.recipe,
      phase: container?.health ?? prior.get(entry.bindingId)?.phase ?? "stopped",
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
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  const materializerId = oneMaterializer(
    project.localPlan.services.map((entry) => entry.materializerId),
  );
  const { local, materializer } = await loadLocalRuntimeModules(project.root, materializerId);
  const identity = local.createLocalProjectIdentity(project.root, project.applicationId);
  const handle = local.acquireLocalProjectLease(identity, {
    mode: "attached",
    sessionId: `local-${reset ? "reset" : "stop"}-${randomUUID()}`,
  });
  let containers = 0;
  try {
    const labels = local.localProjectLabels(identity);
    const existing = await materializer.list(labels, context.signal);
    for (const container of existing) await materializer.remove(container.id, context.signal);
    containers = existing.length;
    if (reset) await materializer.removeVolumes(labels, context.signal);
    for (const name of [
      "provider-overrides.json",
      "local-services.state.json",
      "lease.json",
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
    containers,
    volumesRemoved: reset,
  };
  context.reporter.output(
    output,
    `${reset ? "Reset" : "Stopped"} ${containers} local container${containers === 1 ? "" : "s"}.`,
  );
}
