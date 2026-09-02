import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceInstance,
  type LocalServiceMaterializerRuntime,
  type LocalServiceStartRequest,
} from "@relkit/local-service";
import { createDockerClient, randomLoopbackPort } from "./docker-client.js";
import type { DockerClient, DockerClientOptions } from "./docker-types.js";

export function createDockerMaterializer(
  options: DockerClientOptions & { readonly client?: DockerClient } = {},
): LocalServiceMaterializerRuntime {
  const client = options.client ?? createDockerClient(options);
  const materializer: LocalServiceMaterializerRuntime = {
    kind: "local-service-materializer-runtime",
    protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
    integrationId: "docker",
    list: (labels, signal) => client.containers(labels, signal),
    start: (request) => start(client, request),
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
  };
  return Object.freeze(materializer);
}

async function start(
  client: DockerClient,
  request: LocalServiceStartRequest,
): Promise<LocalServiceInstance> {
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
  const arguments_ = [
    "container",
    "create",
    "--name",
    request.name,
    ...labelArguments(request.labels),
    ...Object.values(request.recipe.ports).flatMap((port) => [
      "--publish",
      randomLoopbackPort(port),
    ]),
    ...(request.volumeName === undefined || request.recipe.volume === undefined
      ? []
      : [
          "--mount",
          `type=volume,source=${request.volumeName},target=${mountPath(request.recipe.volume.mountPath)}`,
        ]),
    ...(request.environmentFile === undefined
      ? []
      : ["--env-file", argument(request.environmentFile)]),
    "--health-cmd",
    healthCommand(request.recipe.health.command),
    "--health-interval",
    duration(request.recipe.health.intervalMs),
    "--health-timeout",
    duration(request.recipe.health.timeoutMs),
    "--health-retries",
    String(positive(request.recipe.health.retries)),
    argument(request.recipe.image),
    ...(request.recipe.command ?? []).map(argument),
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
      timeoutMs:
        request.recipe.health.intervalMs * request.recipe.health.retries +
        request.recipe.health.timeoutMs,
      pollIntervalMs: Math.min(250, request.recipe.health.intervalMs),
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

function labelArguments(values: Readonly<Record<string, string>>): string[] {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ["--label", `${labelKey(key)}=${argument(value)}`]);
}

function labels(values: Readonly<Record<string, string>>): void {
  if (Object.keys(values).length === 0) invalid("Docker labels");
  labelArguments(values);
}

function labelKey(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-/]*$/.test(value)) invalid("Docker label");
  return value;
}

function healthCommand(values: readonly string[]): string {
  if (values.length === 0 || values.some((value) => !/^[a-zA-Z0-9_./:=?-]+$/.test(value))) {
    invalid("Docker health command");
  }
  return values.join(" ");
}

function resourceName(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) invalid("Docker resource");
  return value;
}

function name(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) invalid("Docker resource name");
  return value;
}

function mountPath(value: string): string {
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(value) || value.includes("..")) invalid("Docker mount");
  return value;
}

function duration(value: number): string {
  return `${positive(value)}ms`;
}

function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) invalid("Docker recipe number");
  return value;
}

function argument(value: string): string {
  if (typeof value !== "string" || value === "" || /[\0\r\n]/.test(value)) {
    invalid("Docker argument");
  }
  return value;
}

function invalid(name: string): never {
  throw new TypeError(`${name} is invalid.`);
}
