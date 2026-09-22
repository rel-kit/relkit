import {
  normalizeLocalServiceRecipe,
  type LocalServiceInstance,
  type LocalServiceStartRequest,
  type NormalizedLocalServiceRecipe,
  type NormalizedLocalServiceUnit,
} from "@relkit/local-service";
import {
  argument,
  bindMountArguments,
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
import { reusedUnit, startUnit } from "./docker-composite-unit.js";

export async function startComposite(
  client: DockerClient,
  request: LocalServiceStartRequest,
  gatewayAddress?: string,
): Promise<LocalServiceInstance> {
  const recipe = normalizeLocalServiceRecipe(request.recipe);
  if (recipe.recipeVersion !== 2)
    throw new TypeError("Composite materialization requires recipe version 2");
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
        if (
          !owned(existing.labels, request.labels) ||
          existing.labels["dev.relkit.volume"] !== volume
        ) {
          throw new Error(`Docker volume "${volumeName}" is not owned by this Relkit project.`);
        }
      } else {
        await client.command(
          [
            "volume",
            "create",
            ...compositeLabels(request.labels),
            "--label",
            `dev.relkit.volume=${volume}`,
            volumeName,
          ],
          "Docker volume creation",
          compositeSignal(request),
        );
        createdVolumes.push(volumeName);
      }
    }
    const instances: LocalServiceInstance[] = [];
    const existingUnits = new Map(
      (await client.containers(request.labels, request.signal)).flatMap((instance) => {
        const unitId = instance.labels["dev.relkit.unit-id"];
        return unitId === undefined ? [] : [[unitId, instance] as const];
      }),
    );
    for (const unit of recipe.units) {
      if (unit.kind === "worker" && request.workerArtifact === undefined) continue;
      const existing = unit.kind === "init" ? undefined : existingUnits.get(unit.id);
      if (existing !== undefined) {
        instances.push(reusedUnit(existing, unit, request.name));
        continue;
      }
      const instance = await startUnit(
        client,
        request,
        recipe,
        unit,
        networkName,
        volumes,
        gatewayAddress,
      );
      createdContainers.push(instance.id);
      if (unit.kind === "init") {
        await client.command(
          ["container", "wait", instance.id],
          "Docker init completion",
          compositeSignal(request),
        );
        await client.command(
          ["container", "rm", "--force", instance.id],
          "Docker init cleanup",
          compositeSignal(request),
        );
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
      createdContainers.map((id) =>
        client.command(["container", "rm", "--force", id], "Docker container cleanup"),
      ),
    );
    await Promise.allSettled(
      createdVolumes.map((volume) =>
        client.command(["volume", "rm", volume], "Docker volume cleanup"),
      ),
    );
    if (createdNetwork)
      await client
        .command(["network", "rm", networkName], "Docker network cleanup")
        .catch(() => undefined);
    throw error;
  }
}
