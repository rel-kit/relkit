import { isStableId, type JsonValue } from "@relkit/contracts";
import {
  type CompositeLocalServiceRecipe,
  type CompositeLocalServiceUnit,
  type LocalServiceRecipeInput,
  type LocalServiceHealthCheck,
  type LocalServiceGeneratedSecret,
  type LocalServiceRecipeOutputContext,
  type LocalServiceSecretEnvironment,
  type LocalServiceLiteralEnvironment,
  type CompositeLocalServiceVolume,
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
} from "./recipe.js";
import { assertComposite, common, environments, healthCheck, invalid, path, secrets, text } from "./recipe-validation.js";

const LOCAL_SERVICE_PROTOCOL_VERSION = 1 as const;

export interface NormalizedLocalServiceUnit extends CompositeLocalServiceUnit {
  readonly dependsOn: readonly string[];
  readonly ports: Readonly<Record<string, number>>;
  readonly volumes: readonly { readonly name: string; readonly mountPath: string }[];
  readonly health?: LocalServiceHealthCheck;
}

export interface NormalizedLocalServiceRecipe {
  readonly kind: "local-service-recipe";
  readonly protocolVersion: 1 | typeof LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION;
  readonly integrationId: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
  readonly materializerId: "docker";
  readonly units: readonly NormalizedLocalServiceUnit[];
  readonly volumes: Readonly<Record<string, CompositeLocalServiceVolume>>;
  readonly generatedSecrets: Readonly<Record<string, LocalServiceGeneratedSecret>>;
  readonly environment: Readonly<Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>>;
  readonly network?: Readonly<{ readonly internal?: boolean }>;
  readonly ownership: Readonly<{ readonly scope: "project" | "binding"; readonly retainVolumes: boolean }>;
  readonly outputs: (context: LocalServiceRecipeOutputContext) => Readonly<Record<string, JsonValue>>;
  readonly initialize?: (context: LocalServiceRecipeOutputContext) => Promise<void>;
}

export function normalizeLocalServiceRecipe(
  recipe: LocalServiceRecipeInput,
): NormalizedLocalServiceRecipe {
  common(recipe);
  if (recipe.recipeVersion === 1) {
    const legacy = recipe as Extract<LocalServiceRecipeInput, { readonly image: string }>;
    secrets(legacy.generatedSecrets);
    environments(legacy.environment, legacy.generatedSecrets);
    healthCheck(legacy.health);
    return Object.freeze({
      kind: recipe.kind,
      protocolVersion: recipe.protocolVersion,
      integrationId: recipe.integrationId,
      recipeId: recipe.recipeId,
      recipeVersion: 1,
      materializerId: recipe.materializerId,
      units: Object.freeze([
        unit({
          id: "service",
          kind: "container",
          image: legacy.image,
          ...(legacy.command === undefined ? {} : { command: legacy.command }),
          ports: legacy.ports,
          ...(legacy.volume === undefined
            ? {}
            : { volumes: [{ name: "data", mountPath: legacy.volume.mountPath }] }),
          health: legacy.health,
        }),
      ]),
      volumes: Object.freeze(
        legacy.volume === undefined ? {} : { data: { mountPath: legacy.volume.mountPath } },
      ),
      generatedSecrets: Object.freeze({ ...(legacy.generatedSecrets ?? {}) }),
      environment: Object.freeze({ ...(legacy.environment ?? {}) }),
      ownership: Object.freeze({ scope: "binding", retainVolumes: true }),
      outputs: legacy.outputs,
      ...(legacy.initialize === undefined ? {} : { initialize: legacy.initialize }),
    });
  }
  const composite = recipe as CompositeLocalServiceRecipe;
  assertComposite(composite);
  const units = compositeUnits(composite);
  if (units.length === 0) invalid("Composite recipe must declare at least one unit");
  const ids = new Set<string>();
  for (const candidate of units) {
    if (ids.has(candidate.id)) invalid(`Duplicate local-service unit "${candidate.id}"`);
    ids.add(candidate.id);
  }
  const normalized = units.map((candidate) => unit(candidate));
  const knownVolumes = new Set(Object.keys(composite.volumes));
  for (const [name, volume] of Object.entries(composite.volumes)) {
    if (!isStableId(name) || volume === null || typeof volume !== "object" || !path(volume.mountPath) || (volume.persistent !== undefined && typeof volume.persistent !== "boolean")) invalid("Local-service volume");
  }
  for (const candidate of normalized) {
    for (const dependency of candidate.dependsOn) {
      if (dependency === candidate.id || !ids.has(dependency)) {
        invalid(`Local-service unit "${candidate.id}" has an invalid dependency`);
      }
    }
    for (const mount of candidate.volumes) {
      if (!knownVolumes.has(mount.name)) invalid(`Unknown local-service volume "${mount.name}"`);
    }
  }
  topologicalOrder(normalized);
  secrets(composite.generatedSecrets);
  environments(composite.environment, composite.generatedSecrets);
  for (const candidate of normalized) environments(candidate.environment, composite.generatedSecrets);
  return Object.freeze({
    kind: composite.kind,
    protocolVersion: composite.protocolVersion,
    integrationId: composite.integrationId,
    recipeId: composite.recipeId,
    recipeVersion: 2,
    materializerId: composite.materializerId,
    units: Object.freeze(topologicalOrder(normalized)),
    volumes: Object.freeze({ ...composite.volumes }),
    generatedSecrets: Object.freeze({ ...(composite.generatedSecrets ?? {}) }),
    environment: Object.freeze({ ...(composite.environment ?? {}) }),
    ...(composite.network === undefined ? {} : { network: composite.network }),
    ownership: Object.freeze({
      scope: composite.ownership?.scope ?? "binding",
      retainVolumes: composite.ownership?.retainVolumes ?? true,
    }),
    outputs: composite.outputs,
    ...(composite.initialize === undefined ? {} : { initialize: composite.initialize }),
  });
}

function compositeUnits(recipe: CompositeLocalServiceRecipe): CompositeLocalServiceUnit[] {
  if (recipe.units !== undefined) {
    if (!Array.isArray(recipe.units)) invalid("Composite recipe units");
    if (recipe.containers !== undefined || recipe.init !== undefined || recipe.workers !== undefined)
      invalid("Composite recipe cannot mix units with grouped units");
    return [...recipe.units];
  }
  for (const group of [recipe.containers, recipe.init, recipe.workers]) if (group !== undefined && !Array.isArray(group)) invalid("Composite recipe units");
  return [
    ...(recipe.containers ?? []).map((value) => ({ ...value, kind: "container" as const })),
    ...(recipe.init ?? []).map((value) => ({ ...value, kind: "init" as const })),
    ...(recipe.workers ?? []).map((value) => ({ ...value, kind: "worker" as const })),
  ];
}

function unit(value: CompositeLocalServiceUnit): NormalizedLocalServiceUnit {
  if (!isStableId(value.id) || text(value.image) === "") invalid("Local-service unit identity");
  if (value.command !== undefined && (!Array.isArray(value.command) || value.command.some((part) => typeof part !== "string" || /[\0\r\n]/.test(part)))) invalid("Local-service unit command");
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
  if (value.networkAliases !== undefined && (!Array.isArray(value.networkAliases) || value.networkAliases.some((alias) => !isStableId(alias)))) invalid("Local-service network alias");
  if (value.hostAliases !== undefined && (!record(value.hostAliases) || Object.entries(value.hostAliases).some(([host, address]) => !isStableId(host) || typeof address !== "string" || address === "" || /[\0\r\n]/.test(address)))) invalid("Local-service host alias");
  return Object.freeze({
    ...value,
    image: value.image,
    dependsOn: Object.freeze([...(value.dependsOn ?? [])]),
    ports: Object.freeze({ ...ports }),
    volumes: Object.freeze(volumes),
    ...(value.networkAliases === undefined
      ? {}
      : { networkAliases: Object.freeze([...value.networkAliases]) }),
    ...(value.hostAliases === undefined ? {} : { hostAliases: Object.freeze({ ...value.hostAliases }) }),
  });
}

function topologicalOrder(units: readonly NormalizedLocalServiceUnit[]): NormalizedLocalServiceUnit[] {
  const remaining = new Map(units.map((candidate) => [candidate.id, candidate]));
  const ordered: NormalizedLocalServiceUnit[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((candidate) => candidate.dependsOn.every((dependency) => ordered.some((item) => item.id === dependency)))
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
