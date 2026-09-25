import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import type { CompositeLocalServiceUnit } from "./recipe.types.js";
import type { NormalizedLocalServiceUnit } from "./recipe-normalize.types.js";
import { healthCheck, invalid, path, text } from "./recipe-validation.js";
/** Validate and freeze one composite unit.
 * @param value - Candidate unit.
 * @returns An Effect containing a normalized unit or a tagged validation failure.
 * @example Effect.runSync(normalizeUnitEffect(unit));
 */
export const normalizeUnitEffect = Effect.fn("LocalService.normalizeUnit")(function* (
  value: CompositeLocalServiceUnit,
) {
  if (!isStableId(value.id) || (yield* text(value.image)) === "")
    yield* invalid("Local-service unit identity");
  if (value.kind !== "container" && value.kind !== "init" && value.kind !== "worker")
    yield* invalid("Local-service unit kind");
  if (value.dependsOn !== undefined && !Array.isArray(value.dependsOn))
    yield* invalid("Local-service unit dependency");
  if (
    value.command !== undefined &&
    (!Array.isArray(value.command) ||
      value.command.some((part) => typeof part !== "string" || /[\0\r\n]/.test(part)))
  )
    yield* invalid("Local-service unit command");
  if (
    value.ports !== undefined &&
    (value.ports === null || typeof value.ports !== "object" || Array.isArray(value.ports))
  )
    yield* invalid("Local-service unit port");
  const ports = value.ports ?? {};
  const portValues = new Set<number>();
  for (const [name, port] of Object.entries(ports)) {
    if (!isStableId(name) || !Number.isSafeInteger(port) || port < 1 || port > 65_535)
      yield* invalid("Local-service unit port");
    if (portValues.has(port)) yield* invalid("Duplicate local-service unit port");
    portValues.add(port);
  }
  if (value.volumes !== undefined && !Array.isArray(value.volumes))
    yield* invalid("Local-service unit volume");
  const volumes: { readonly name: string; readonly mountPath: string }[] = [];
  for (const mount of value.volumes ?? []) {
    if (
      mount === null ||
      typeof mount !== "object" ||
      Array.isArray(mount) ||
      !isStableId(mount.name) ||
      !(yield* path(mount.mountPath))
    )
      yield* invalid("Local-service unit volume");
    volumes.push(Object.freeze({ name: mount.name, mountPath: mount.mountPath }));
  }
  if (new Set(volumes.map((mount) => mount.name)).size !== volumes.length)
    yield* invalid("Duplicate local-service unit volume");
  if (value.health !== undefined) yield* healthCheck(value.health);
  if (
    value.networkAliases !== undefined &&
    (!Array.isArray(value.networkAliases) ||
      value.networkAliases.some((alias) => !isStableId(alias)))
  )
    yield* invalid("Local-service network alias");
  if (
    value.hostAliases !== undefined &&
    (value.hostAliases === null ||
      typeof value.hostAliases !== "object" ||
      Array.isArray(value.hostAliases) ||
      Object.entries(value.hostAliases).some(
        ([host, address]) =>
          !isStableId(host) ||
          typeof address !== "string" ||
          address === "" ||
          /[\0\r\n]/.test(address),
      ))
  )
    yield* invalid("Local-service host alias");
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
  }) as NormalizedLocalServiceUnit;
});
/** Sort units by dependency layer and stable identifier.
 * @param units - Validated units with resolved dependencies.
 * @returns An Effect containing ordered units or a tagged dependency-cycle failure.
 * @example Effect.runSync(topologicalOrderEffect(units));
 */
export const topologicalOrderEffect = Effect.fn("LocalService.topologicalOrder")(function* (
  units: readonly NormalizedLocalServiceUnit[],
) {
  const remaining = new Map(units.map((candidate) => [candidate.id, candidate]));
  const ordered: NormalizedLocalServiceUnit[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((candidate) =>
        candidate.dependsOn.every((dependency) => ordered.some((item) => item.id === dependency)),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    if (ready.length === 0) yield* invalid("Local-service unit dependency cycle");
    for (const candidate of ready) {
      remaining.delete(candidate.id);
      ordered.push(candidate);
    }
  }
  return ordered;
});
