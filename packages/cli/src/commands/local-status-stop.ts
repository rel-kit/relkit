import { randomUUID } from "node:crypto";
import { hashGeneratedArtifact } from "@relkit/compiler";
import type { LocalServiceInstance } from "@relkit/local-service";
import type { CliCommandContext } from "../main-support.js";
import { loadLocalRuntimeModules } from "./local-runtime-modules.js";
import { formatServices, loadLocalProject, processAlive } from "./local-operation-support.js";
import { selectPlan } from "./local-plan.js";

export async function localStatus(
  projectRoot: string,
  context: Pick<CliCommandContext, "reporter" | "signal">,
  service?: string,
  environment?: string,
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  const localPlan = selectPlan(project.localPlan, service);
  const materializerId = oneMaterializer(localPlan.services.map((entry) => entry.materializerId));
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
  const prior = new Map(state?.services.map((entry) => [entry.bindingId, entry]));
  const services = localPlan.services.map((entry) => {
    const container = byBinding.get(entry.bindingId);
    const expectedUnits = prior.get(entry.bindingId)?.units;
    const actualUnits = container?.units?.map((unit) => unit.unitId);
    const incomplete =
      expectedUnits !== undefined &&
      actualUnits !== undefined &&
      (expectedUnits.length !== actualUnits.length ||
        expectedUnits.some((unit) => !actualUnits.includes(unit)));
    return {
      bindingId: entry.bindingId,
      recipe: entry.recipe,
      phase: incomplete
        ? "unhealthy"
        : (container?.health ?? prior.get(entry.bindingId)?.phase ?? "stopped"),
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
  service?: string,
  environment?: string,
): Promise<void> {
  const project = await loadLocalProject(projectRoot, context.signal);
  const localPlan = selectPlan(project.localPlan, service);
  const materializerId = oneMaterializer(localPlan.services.map((entry) => entry.materializerId));
  const { local, materializer } = await loadLocalRuntimeModules(project.root, materializerId);
  const identity = local.createLocalProjectIdentity(project.root, project.applicationId);
  const labels = local.localProjectLabels(identity);
  let existing: readonly LocalServiceInstance[] = [];
  let volumes: readonly { readonly name: string }[] = [];
  if (dryRun) {
    existing = await materializer.list(labels, context.signal);
    if (service !== undefined) {
      const selected = new Set(localPlan.services.map((entry) => entry.bindingId));
      existing = existing.filter((entry) =>
        selected.has(entry.labels["dev.relkit.binding-id"] ?? ""),
      );
    }
    volumes = reset
      ? service === undefined
        ? ((await materializer.listVolumes?.(labels, context.signal)) ?? [])
        : []
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
    context.reporter.output(
      output,
      `Would reset ${existing.length} local container${existing.length === 1 ? "" : "s"}.`,
    );
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
        if (materializer.stop !== undefined)
          await materializer.stop(id, context.signal).catch(() => undefined);
        await materializer.remove(id, context.signal);
      }
    }
    if (reset && service === undefined) await materializer.removeVolumes(labels, context.signal);
    if (reset && service === undefined) await materializer.removeNetworks?.(labels, context.signal);
    for (const name of [
      "provider-overrides.json",
      "worker-provider-overrides.json",
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

function oneMaterializer(values: readonly string[]): string {
  const materializer = values[0];
  if (materializer === undefined || values.some((value) => value !== materializer)) {
    throw new Error("Local service bindings must use one materializer");
  }
  return materializer;
}
