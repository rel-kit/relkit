import type { JsonValue } from "@relkit/contracts";
import type {
  CompositeLocalServiceUnit,
  CompositeLocalServiceVolume,
  LocalServiceGeneratedSecret,
  LocalServiceHealthCheck,
  LocalServiceLiteralEnvironment,
  LocalServiceRecipeOutputContext,
  LocalServiceSecretEnvironment,
} from "./recipe.types.js";
import type { LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION } from "./recipe.js";

/** Validated unit with required frozen collections.
 * @example const ids = recipe.units.map((unit: NormalizedLocalServiceUnit) => unit.id);
 */
export interface NormalizedLocalServiceUnit extends CompositeLocalServiceUnit {
  readonly dependsOn: readonly string[];
  readonly ports: Readonly<Record<string, number>>;
  readonly volumes: readonly { readonly name: string; readonly mountPath: string }[];
  readonly health?: LocalServiceHealthCheck;
}

/** Canonical recipe used by local materializers.
 * Units are ordered by dependency and ID and the root collections are frozen.
 * @example const normalized: NormalizedLocalServiceRecipe = normalizeLocalServiceRecipe(recipe);
 */
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
  readonly environment: Readonly<
    Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>
  >;
  readonly network?: Readonly<{ readonly internal?: boolean }>;
  readonly ownership: Readonly<{
    readonly scope: "project" | "binding";
    readonly retainVolumes: boolean;
  }>;
  readonly outputs: (
    context: LocalServiceRecipeOutputContext,
  ) => Readonly<Record<string, JsonValue>>;
  readonly initialize?: (context: LocalServiceRecipeOutputContext) => Promise<void>;
}
