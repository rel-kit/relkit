import { DockerEngineError, type DockerContainer, type DockerVolume } from "./docker-types.js";

export function parseContainers(source: string): readonly DockerContainer[] {
  return array(source).map((value) => {
    const item = record(value);
    const state = record(item.State);
    const health = optionalRecord(state.Health)?.Status;
    if (
      typeof item.Id !== "string" ||
      typeof item.Name !== "string" ||
      typeof state.Status !== "string" ||
      (health !== undefined &&
        health !== "starting" &&
        health !== "healthy" &&
        health !== "unhealthy")
    ) {
      invalid();
    }
    return Object.freeze({
      id: item.Id,
      name: item.Name.replace(/^\//, ""),
      labels: labels(record(item.Config)?.Labels),
      state: state.Status,
      ...(health === undefined ? {} : { health }),
      ports: ports(record(item.NetworkSettings)?.Ports),
    });
  });
}

export function parseVolumes(source: string): readonly DockerVolume[] {
  return array(source).map((value) => {
    const item = record(value);
    if (typeof item.Name !== "string") invalid();
    return Object.freeze({ name: item.Name, labels: labels(item.Labels) });
  });
}

function array(source: string): readonly unknown[] {
  try {
    const value = JSON.parse(source) as unknown;
    if (Array.isArray(value)) return value;
  } catch {
    // Mapped to one safe response error below.
  }
  return invalid();
}

function labels(value: unknown): Readonly<Record<string, string>> {
  if (value === null || value === undefined) return Object.freeze({});
  const source = record(value);
  const result: Record<string, string> = {};
  for (const [key, label] of Object.entries(source)) {
    if (typeof label !== "string") invalid();
    result[key] = label;
  }
  return Object.freeze(result);
}

function ports(value: unknown): Readonly<Record<string, number>> {
  if (value === null || value === undefined) return Object.freeze({});
  const source = record(value);
  const result: Record<string, number> = {};
  for (const [containerPort, bindings] of Object.entries(source)) {
    if (bindings === null) continue;
    if (!Array.isArray(bindings) || bindings.length !== 1) invalid();
    const binding = record(bindings[0]);
    if (binding.HostIp !== "127.0.0.1" && binding.HostIp !== "::1") invalid();
    const hostPort = Number(binding.HostPort);
    if (!Number.isSafeInteger(hostPort) || hostPort < 1 || hostPort > 65_535) invalid();
    result[containerPort] = hostPort;
  }
  return Object.freeze(result);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value === undefined ? undefined : record(value);
}

function invalid(): never {
  throw new DockerEngineError("RELKIT_DOCKER_RESPONSE_INVALID", "Docker returned invalid data.");
}
