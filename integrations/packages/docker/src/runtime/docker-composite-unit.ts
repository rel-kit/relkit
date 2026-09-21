import {
  argument,
  bindMountArguments,
  compositeLabels,
  compositeSignal,
  environmentArguments,
  healthArgs,
  mountPath,
  resourceName,
} from "./docker-composite-support.js";
import { publishedPortArguments } from "./docker-health.js";
import type { DockerClient } from "./docker-types.js";
import type {
  LocalServiceInstance,
  LocalServiceStartRequest,
  NormalizedLocalServiceRecipe,
  NormalizedLocalServiceUnit,
} from "@relkit/local-service";

export function reusedUnit(
  existing: LocalServiceInstance,
  unit: NormalizedLocalServiceUnit,
  serviceName: string,
): LocalServiceInstance {
  if (
    existing.state !== "running" ||
    (unit.health !== undefined && existing.health !== "healthy")
  ) {
    throw new Error("Existing Docker unit " + unit.id + " is not healthy enough to reuse.");
  }
  const ports = { ...existing.ports };
  for (const [name, containerPort] of Object.entries(unit.ports)) {
    const value = existing.ports[name] ?? existing.ports[String(containerPort) + "/tcp"];
    if (value !== undefined) ports[name] = value;
  }
  return Object.freeze({
    ...existing,
    name: serviceName + "-" + unit.id,
    unitId: unit.id,
    ports: Object.freeze(ports),
  });
}

export async function startUnit(
  client: DockerClient,
  request: LocalServiceStartRequest,
  recipe: NormalizedLocalServiceRecipe,
  unit: NormalizedLocalServiceUnit,
  networkName: string,
  volumes: Readonly<Record<string, string>>,
  gatewayAddress?: string,
): Promise<LocalServiceInstance> {
  const nameValue = `${request.name}-${unit.id}`;
  resourceName(nameValue);
  const unitLabels = {
    ...request.labels,
    "dev.relkit.unit-id": unit.id,
    "dev.relkit.unit-kind": unit.kind,
  };
  const publishArguments = (
    await Promise.all(
      Object.entries(unit.ports).map(([name, port]) =>
        publishedPortArguments(port, gatewayAddress, request.portBindings?.[unit.id]?.[name]),
      ),
    )
  ).flat();
  const args = [
    "container",
    "create",
    "--name",
    nameValue,
    ...compositeLabels(unitLabels),
    "--network",
    networkName,
    ...[unit.id, ...(unit.networkAliases ?? [])].flatMap((alias) => ["--network-alias", alias]),
    ...Object.entries(unit.hostAliases ?? {}).flatMap(([host, address]) => [
      "--add-host",
      `${argument(host)}:${argument(address)}`,
    ]),
    ...publishArguments,
    ...bindMountArguments(request.bindMounts?.[unit.id]),
    ...unit.volumes.flatMap((mount) => [
      "--mount",
      `type=volume,source=${volumes[mount.name]},target=${mountPath(mount.mountPath)}`,
    ]),
    ...((request.environmentFiles?.[unit.id] ?? request.environmentFile) === undefined
      ? []
      : ["--env-file", (request.environmentFiles?.[unit.id] ?? request.environmentFile)!]),
    ...environmentArguments({
      ...request.environmentVariables,
      ...request.environmentVariablesByUnit?.[unit.id],
    }),
    ...(unit.health === undefined
      ? []
      : healthArgs(
          unit.health.command,
          unit.health.intervalMs,
          unit.health.timeoutMs,
          unit.health.retries,
        )),
    argument(unit.image),
    ...(unit.command ?? []).map(argument),
  ];
  let id: string | undefined;
  try {
    id = await client.command(
      args,
      "Docker composite container creation",
      compositeSignal(request),
    );
    await client.command(
      ["container", "start", id],
      "Docker composite container startup",
      compositeSignal(request),
    );
    const inspected =
      unit.health === undefined
        ? await client.inspectContainer(id, request.signal)
        : await client.waitForHealthy(id, {
            timeoutMs: unit.health.intervalMs * unit.health.retries + unit.health.timeoutMs,
            pollIntervalMs: Math.min(250, unit.health.intervalMs),
            ...(request.signal === undefined ? {} : { signal: request.signal }),
          });
    const healthy = {
      ...inspected,
      health: inspected.health ?? (inspected.state === "running" ? "healthy" : "unhealthy"),
    } as LocalServiceInstance;
    const ports: Record<string, number> = { ...healthy.ports };
    for (const [key, port] of Object.entries(unit.ports)) {
      const value = healthy.ports[`${port}/tcp`];
      if (value !== undefined) ports[key] = value;
    }
    return Object.freeze({
      ...healthy,
      name: nameValue,
      labels: unitLabels,
      ports: Object.freeze(ports),
      unitId: unit.id,
    });
  } catch (error) {
    if (id !== undefined)
      await client
        .command(["container", "rm", "--force", id], "Docker composite container cleanup")
        .catch(() => undefined);
    throw error;
  }
}
