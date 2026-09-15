import {
  normalizeLocalServiceRecipe,
  type LocalServiceInstance,
  type LocalServiceStartRequest,
  type NormalizedLocalServiceRecipe,
  type NormalizedLocalServiceUnit,
} from "@relkit/local-service";
import {
  argument,
  compositeLabels,
  compositeSignal,
  environmentArguments,
  healthArgs,
  inspectNetwork,
  mountPath,
  resourceName,
  owned,
  positive,
  volumeNames,
} from "./docker-composite-support.js";
import { randomLoopbackPort } from "./docker-client.js";
import type { DockerClient } from "./docker-types.js";

export async function startComposite(
  client: DockerClient,
  request: LocalServiceStartRequest,
): Promise<LocalServiceInstance> {
  const recipe = normalizeLocalServiceRecipe(request.recipe);
  if (recipe.recipeVersion !== 2) throw new TypeError("Composite materialization requires recipe version 2");
  const networkName = request.networkName ?? `${request.name}-network`;
  resourceName(networkName);
  const volumes = volumeNames(request.name, request.volumeNames, recipe);
  const createdContainers: string[] = [];
  const createdVolumes: string[] = [];
  let createdNetwork = false;
  compositeLabels(request.labels);
  await client.discover(request.signal);
  try {
    const existingNetwork = await inspectNetwork(client, networkName, request);
    if (existingNetwork === undefined) {
      await client.command(
        [
          "network",
          "create",
          "--driver",
          "bridge",
          ...(recipe.network?.internal === true ? ["--internal"] : []),
          ...compositeLabels(request.labels),
          networkName,
        ],
        "Docker network creation",
        compositeSignal(request),
      );
      createdNetwork = true;
    } else if (!owned(existingNetwork, request.labels)) {
      throw new Error(`Docker network "${networkName}" is not owned by this Relkit project.`);
    }
    const existingVolumes = new Map(
      (await client.volumes(undefined, request.signal)).map((volume) => [volume.name, volume]),
    );
    for (const [volume, volumeName] of Object.entries(volumes)) {
      const existing = existingVolumes.get(volumeName);
      if (existing !== undefined) {
        if (!owned(existing.labels, request.labels) || existing.labels["dev.relkit.volume"] !== volume) {
          throw new Error(`Docker volume "${volumeName}" is not owned by this Relkit project.`);
        }
      } else {
        await client.command(
          ["volume", "create", ...compositeLabels(request.labels), "--label", `dev.relkit.volume=${volume}`, volumeName],
          "Docker volume creation",
          compositeSignal(request),
        );
        createdVolumes.push(volumeName);
      }
    }
    const instances: LocalServiceInstance[] = [];
    for (const unit of recipe.units) {
      const instance = await startUnit(client, request, recipe, unit, networkName, volumes);
      createdContainers.push(instance.id);
      if (unit.kind === "init") {
        await client.command(["container", "wait", instance.id], "Docker init completion", compositeSignal(request));
        await client.command(["container", "rm", "--force", instance.id], "Docker init cleanup", compositeSignal(request));
        continue;
      }
      instances.push(instance);
    }
    if (instances.length === 0) throw new Error("Composite recipe has no durable units");
    const root = instances[0]!;
    const ports: Record<string, number> = {};
    for (const instance of instances) {
      for (const [key, value] of Object.entries(instance.ports)) {
        ports[`${instance.unitId ?? instance.name}.${key}`] = value;
        if (!Object.hasOwn(ports, key)) ports[key] = value;
      }
    }
    return Object.freeze({
      ...root,
      id: root.id,
      name: request.name,
      labels: request.labels,
      ports: Object.freeze(ports),
      units: Object.freeze(instances),
      networkName,
    });
  } catch (error) {
    await Promise.allSettled(
      createdContainers.map((id) => client.command(["container", "rm", "--force", id], "Docker container cleanup")),
    );
    await Promise.allSettled(
      createdVolumes.map((volume) => client.command(["volume", "rm", volume], "Docker volume cleanup")),
    );
    if (createdNetwork) await client.command(["network", "rm", networkName], "Docker network cleanup").catch(() => undefined);
    throw error;
  }
}

async function startUnit(
  client: DockerClient,
  request: LocalServiceStartRequest,
  recipe: NormalizedLocalServiceRecipe,
  unit: NormalizedLocalServiceUnit,
  networkName: string,
  volumes: Readonly<Record<string, string>>,
): Promise<LocalServiceInstance> {
  const nameValue = `${request.name}-${unit.id}`;
  resourceName(nameValue);
  const unitLabels = { ...request.labels, "dev.relkit.unit-id": unit.id, "dev.relkit.unit-kind": unit.kind };
  const args = [
    "container",
    "create",
    "--name",
    nameValue,
    ...compositeLabels(unitLabels),
    "--network",
    networkName,
    ...[unit.id, ...(unit.networkAliases ?? [])].flatMap((alias) => ["--network-alias", alias]),
    ...Object.entries(unit.hostAliases ?? {}).flatMap(([host, address]) => ["--add-host", `${argument(host)}:${argument(address)}`]),
    ...Object.values(unit.ports).flatMap((port) => ["--publish", randomLoopbackPort(port)]),
    ...unit.volumes.flatMap((mount) => [
      "--mount",
      `type=volume,source=${volumes[mount.name]},target=${mountPath(mount.mountPath)}`,
    ]),
    ...(request.environmentFiles?.[unit.id] ?? request.environmentFile) === undefined
      ? []
      : ["--env-file", (request.environmentFiles?.[unit.id] ?? request.environmentFile)!],
    ...environmentArguments(request.environmentVariables),
    ...(unit.health === undefined ? [] : healthArgs(unit.health.command, unit.health.intervalMs, unit.health.timeoutMs, unit.health.retries)),
    argument(unit.image),
    ...(unit.command ?? []).map(argument),
  ];
  let id: string | undefined;
  try {
    id = await client.command(args, "Docker composite container creation", compositeSignal(request));
    await client.command(["container", "start", id], "Docker composite container startup", compositeSignal(request));
    const inspected = unit.health === undefined
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
    return Object.freeze({ ...healthy, name: nameValue, labels: unitLabels, ports: Object.freeze(ports), unitId: unit.id });
  } catch (error) {
    if (id !== undefined) await client.command(["container", "rm", "--force", id], "Docker composite container cleanup").catch(() => undefined);
    throw error;
  }
}
