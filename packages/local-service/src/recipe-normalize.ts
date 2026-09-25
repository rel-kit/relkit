import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import type {
  CompositeLocalServiceRecipe,
  CompositeLocalServiceUnit,
  LocalServiceRecipeInput,
} from "./recipe.types.js";
import type {
  NormalizedLocalServiceRecipe,
  NormalizedLocalServiceUnit,
} from "./recipe-normalize.types.js";
import {
  assertComposite,
  common,
  environments,
  healthCheck,
  invalid,
  path,
  secrets,
} from "./recipe-validation.js";
import { normalizeUnitEffect, topologicalOrderEffect } from "./recipe-normalize-units.js";
import { observeLocalService, runLocalService } from "./local-service-observability.js";
export type {
  NormalizedLocalServiceRecipe,
  NormalizedLocalServiceUnit,
} from "./recipe-normalize.types.js";
/** Normalize a supported recipe in the Effect error channel.
 * @param recipe - Version 1 or version 2 recipe candidate.
 * @returns An Effect containing a frozen recipe or LocalServiceValidationFailure.
 * @example Effect.runSync(normalizeLocalServiceRecipeEffect(recipe));
 */
export const normalizeLocalServiceRecipeEffect = Effect.fn(
  "LocalService.normalizeLocalServiceRecipe",
)(function* (recipe: LocalServiceRecipeInput) {
  return yield* observeLocalService("recipe.normalize", normalizeRecipe(recipe));
});
/** Normalize a recipe synchronously for existing callers.
 * @param recipe - Version 1 or version 2 recipe candidate.
 * @returns The frozen canonical recipe.
 * @throws TypeError when a recipe field or dependency is invalid.
 * @example normalizeLocalServiceRecipe(recipe);
 */
export function normalizeLocalServiceRecipe(
  recipe: LocalServiceRecipeInput,
): NormalizedLocalServiceRecipe {
  return runLocalService(normalizeLocalServiceRecipeEffect(recipe));
}
const normalizeRecipe = Effect.fn("LocalService.normalizeRecipe")(function* (
  recipe: LocalServiceRecipeInput,
) {
  yield* common(recipe);
  if (recipe.recipeVersion === 1) {
    const legacy = recipe as Extract<LocalServiceRecipeInput, { readonly image: string }>;
    yield* secrets(legacy.generatedSecrets);
    yield* environments(legacy.environment, legacy.generatedSecrets);
    yield* healthCheck(legacy.health);
    if (
      legacy.volume !== undefined &&
      (legacy.volume === null || typeof legacy.volume !== "object" || Array.isArray(legacy.volume))
    )
      yield* invalid("Local-service volume");
    const service = yield* normalizeUnitEffect({
      id: "service",
      kind: "container",
      image: legacy.image,
      ...(legacy.command === undefined ? {} : { command: legacy.command }),
      ports: legacy.ports,
      ...(legacy.volume === undefined
        ? {}
        : { volumes: [{ name: "data", mountPath: legacy.volume.mountPath }] }),
      health: legacy.health,
    });
    return Object.freeze({
      kind: recipe.kind,
      protocolVersion: recipe.protocolVersion,
      integrationId: recipe.integrationId,
      recipeId: recipe.recipeId,
      recipeVersion: 1,
      materializerId: recipe.materializerId,
      units: Object.freeze([service]),
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
  yield* assertComposite(composite);
  const units = yield* compositeUnits(composite);
  if (units.length === 0) yield* invalid("Composite recipe must declare at least one unit");
  const ids = new Set<string>();
  for (const candidate of units) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate))
      yield* invalid("Local-service unit identity");
    if (ids.has(candidate.id))
      yield* invalid('Duplicate local-service unit "' + candidate.id + '"');
    ids.add(candidate.id);
  }
  const normalized: NormalizedLocalServiceUnit[] = [];
  for (const candidate of units) normalized.push(yield* normalizeUnitEffect(candidate));
  const knownVolumes = new Set(Object.keys(composite.volumes));
  for (const [name, volume] of Object.entries(composite.volumes)) {
    if (
      !isStableId(name) ||
      volume === null ||
      typeof volume !== "object" ||
      !(yield* path(volume.mountPath)) ||
      (volume.persistent !== undefined && typeof volume.persistent !== "boolean")
    )
      yield* invalid("Local-service volume");
  }
  for (const candidate of normalized) {
    for (const dependency of candidate.dependsOn) {
      if (dependency === candidate.id || !ids.has(dependency))
        yield* invalid('Local-service unit "' + candidate.id + '" has an invalid dependency');
    }
    for (const mount of candidate.volumes)
      if (!knownVolumes.has(mount.name))
        yield* invalid('Unknown local-service volume "' + mount.name + '"');
  }
  const ordered = yield* topologicalOrderEffect(normalized);
  yield* secrets(composite.generatedSecrets);
  yield* environments(composite.environment, composite.generatedSecrets);
  for (const candidate of normalized)
    yield* environments(candidate.environment, composite.generatedSecrets);
  return Object.freeze({
    kind: composite.kind,
    protocolVersion: composite.protocolVersion,
    integrationId: composite.integrationId,
    recipeId: composite.recipeId,
    recipeVersion: 2,
    materializerId: composite.materializerId,
    units: Object.freeze(ordered),
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
});
/** Resolve flat or grouped unit declarations; mixed forms fail before unit validation. */
const compositeUnits = Effect.fn("LocalService.compositeUnits")(function* (
  recipe: CompositeLocalServiceRecipe,
) {
  if (recipe.units !== undefined) {
    if (!Array.isArray(recipe.units)) yield* invalid("Composite recipe units");
    if (
      recipe.containers !== undefined ||
      recipe.init !== undefined ||
      recipe.workers !== undefined
    )
      yield* invalid("Composite recipe cannot mix units with grouped units");
    return [...recipe.units];
  }
  for (const group of [recipe.containers, recipe.init, recipe.workers])
    if (group !== undefined && !Array.isArray(group)) yield* invalid("Composite recipe units");
  return [
    ...(recipe.containers ?? []).map((value) => ({ ...value, kind: "container" as const })),
    ...(recipe.init ?? []).map((value) => ({ ...value, kind: "init" as const })),
    ...(recipe.workers ?? []).map((value) => ({ ...value, kind: "worker" as const })),
  ];
});
