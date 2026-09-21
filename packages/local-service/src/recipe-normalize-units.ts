import { isStableId } from "@relkit/contracts";
import type { CompositeLocalServiceUnit } from "./recipe.js";
import type { NormalizedLocalServiceUnit } from "./recipe-normalize.js";
import { healthCheck, invalid, path, text } from "./recipe-validation.js";

export function unit(value: CompositeLocalServiceUnit): NormalizedLocalServiceUnit {
  if (!isStableId(value.id) || text(value.image) === "") invalid("Local-service unit identity");
  if (
    value.command !== undefined &&
    (!Array.isArray(value.command) ||
      value.command.some((part) => typeof part !== "string" || /[\0\r\n]/.test(part)))
  )
    invalid("Local-service unit command");
  const ports = value.ports ?? {};
  const portValues = new Set<number>();
  for (const [name, port] of Object.entries(ports)) {
    if (!isStableId(name) || !Number.isSafeInteger(port) || port < 1 || port > 65_535)
      invalid("Local-service unit port");
    if (portValues.has(port)) invalid("Duplicate local-service unit port");
    portValues.add(port);
  }
  const volumes = (value.volumes ?? []).map((mount) => {
    if (!isStableId(mount.name) || !path(mount.mountPath)) invalid("Local-service unit volume");
    return Object.freeze({ name: mount.name, mountPath: mount.mountPath });
  });
  if (new Set(volumes.map((mount) => mount.name)).size !== volumes.length)
    invalid("Duplicate local-service unit volume");
  if (value.health !== undefined) healthCheck(value.health);
  if (
    value.networkAliases !== undefined &&
    (!Array.isArray(value.networkAliases) ||
      value.networkAliases.some((alias) => !isStableId(alias)))
  )
    invalid("Local-service network alias");
  if (
    value.hostAliases !== undefined &&
    (!record(value.hostAliases) ||
      Object.entries(value.hostAliases).some(
        ([host, address]) =>
          !isStableId(host) ||
          typeof address !== "string" ||
          address === "" ||
          /[\0\r\n]/.test(address),
      ))
  )
    invalid("Local-service host alias");
  return Object.freeze({
    ...value,
    image: value.image,
    dependsOn: Object.freeze([...(value.dependsOn ?? [])]),
    ports: Object.freeze({ ...ports }),
    volumes: Object.freeze(volumes),
    ...(value.networkAliases === undefined
      ? {}
      : { networkAliases: Object.freeze([...value.networkAliases]) }),
    ...(value.hostAliases === undefined
      ? {}
      : { hostAliases: Object.freeze({ ...value.hostAliases }) }),
  });
}

export function topologicalOrder(
  units: readonly NormalizedLocalServiceUnit[],
): NormalizedLocalServiceUnit[] {
  const remaining = new Map(units.map((candidate) => [candidate.id, candidate]));
  const ordered: NormalizedLocalServiceUnit[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((candidate) =>
        candidate.dependsOn.every((dependency) => ordered.some((item) => item.id === dependency)),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    if (ready.length === 0) invalid("Local-service unit dependency cycle");
    for (const candidate of ready) {
      remaining.delete(candidate.id);
      ordered.push(candidate);
    }
  }
  return ordered;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
