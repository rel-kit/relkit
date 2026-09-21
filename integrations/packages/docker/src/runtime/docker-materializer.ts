import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceInstance,
  type LocalServiceMaterializerRuntime,
  type LocalServiceStartRequest,
} from "@relkit/local-service";
import { createDockerClient } from "./docker-client.js";
import { publishedPortArguments } from "./docker-health.js";
import { startComposite } from "./docker-composite.js";
import { environmentArguments } from "./docker-composite-support.js";
import {
  argument,
  duration,
  healthCommand,
  labels,
  labelArguments,
  mountPath,
  name,
  networkLabelFilters,
  positive,
  resourceName,
} from "./docker-materializer-support.js";
import type { DockerClient, DockerClientOptions } from "./docker-types.js";

export function createDockerMaterializer(
  options: DockerClientOptions & {
    readonly client?: DockerClient;
    readonly gatewayAddress?: string;
  } = {},
): LocalServiceMaterializerRuntime {
  const client = options.client ?? createDockerClient(options);
  const materializer: LocalServiceMaterializerRuntime = {
    kind: "local-service-materializer-runtime",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    integrationId: "docker",
    list: (labels, signal) => client.containers(labels, signal),
    start: async (request) => {
      const gatewayAddress =
        options.gatewayAddress ??
        (options.client === undefined && process.platform === "linux"
          ? await client.command(
              ["network", "inspect", "bridge", "--format", "{{(index .IPAM.Config 0).Gateway}}"],
              "Docker bridge gateway discovery",
              request.signal === undefined ? {} : { signal: request.signal },
            )
          : undefined);
      return start(client, request, gatewayAddress);
    },
    stop: async (id, signal) => {
      await client.command(
        ["container", "stop", "--time", "10", resourceName(id)],
        "Docker container graceful stop",
        signal === undefined ? {} : { signal },
      );
    },
    remove: async (id, signal) => {
      await client.command(
        ["container", "rm", "--force", resourceName(id)],
        "Docker container removal",
        signal === undefined ? {} : { signal },
      );
    },
    removeVolumes: async (labels, signal) => {
      const volumes = await client.volumes(labels, signal);
      for (const volume of volumes) {
        await client.command(
          ["volume", "rm", resourceName(volume.name)],
          "Docker volume removal",
          signal === undefined ? {} : { signal },
        );
      }
    },
    listVolumes: (labels, signal) => client.volumes(labels, signal),
    removeNetworks: async (labels, signal) => {
      const names = (
        await client.command(
          ["network", "ls", "--quiet", ...networkLabelFilters(labels)],
          "Docker network listing",
          signal === undefined ? {} : { signal },
        )
      )
        .split(/\r?\n/u)
        .map((name) => name.trim())
        .filter(Boolean);
      for (const network of names) {
        await client.command(
          ["network", "rm", resourceName(network)],
          "Docker network removal",
          signal === undefined ? {} : { signal },
        );
      }
    },
  };
  return Object.freeze(materializer);
}

async function start(
  client: DockerClient,
  request: LocalServiceStartRequest,
  gatewayAddress?: string,
): Promise<LocalServiceInstance> {
  if (!("image" in request.recipe)) return startComposite(client, request, gatewayAddress);
  const recipe = request.recipe;
  name(request.name);
  labels(request.labels);
  await client.discover(request.signal);
  if (request.volumeName !== undefined) {
    name(request.volumeName);
    await client.command(
      ["volume", "create", ...labelArguments(request.labels), request.volumeName],
      "Docker volume creation",
      request.signal === undefined ? {} : { signal: request.signal },
    );
  }
  const publishArguments = (
    await Promise.all(
      Object.values(request.recipe.ports).map((port) =>
        publishedPortArguments(port, gatewayAddress),
      ),
    )
  ).flat();
  const arguments_ = [
    "container",
    "create",
    "--name",
    request.name,
    ...labelArguments(request.labels),
    ...publishArguments,
    ...(request.volumeName === undefined || recipe.volume === undefined
      ? []
      : [
          "--mount",
          `type=volume,source=${request.volumeName},target=${mountPath(recipe.volume.mountPath)}`,
        ]),
    ...(request.environmentFile === undefined
      ? []
      : ["--env-file", argument(request.environmentFile)]),
    ...environmentArguments(request.environmentVariables),
    "--health-cmd",
    healthCommand(recipe.health.command),
    "--health-interval",
    duration(recipe.health.intervalMs),
    "--health-timeout",
    duration(recipe.health.timeoutMs),
    "--health-retries",
    String(positive(recipe.health.retries)),
    argument(recipe.image),
    ...(recipe.command ?? []).map(argument),
  ];
  let id: string | undefined;
  try {
    id = await client.command(
      arguments_,
      "Docker container creation",
      request.signal === undefined ? {} : { signal: request.signal },
    );
    resourceName(id);
    await client.command(
      ["container", "start", id],
      "Docker container startup",
      request.signal === undefined ? {} : { signal: request.signal },
    );
    return await client.waitForHealthy(id, {
      timeoutMs: recipe.health.intervalMs * recipe.health.retries + recipe.health.timeoutMs,
      pollIntervalMs: Math.min(250, recipe.health.intervalMs),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
  } catch (error) {
    if (id !== undefined) {
      await client
        .command(["container", "rm", "--force", id], "Docker container cleanup")
        .catch(() => undefined);
    }
    throw error;
  }
}
