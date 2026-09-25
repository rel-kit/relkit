import type { JsonValue } from "@relkit/contracts";
import type { LOCAL_SERVICE_PROTOCOL_VERSION } from "./protocol.js";
import type { LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION } from "./recipe.js";

/** Runtime values supplied to recipe output and initialization callbacks.
 * @example const context: LocalServiceRecipeOutputContext = { ports: {}, secrets: {} };
 */
export interface LocalServiceRecipeOutputContext {
  readonly ports: Readonly<Record<string, number>>;
  readonly secrets: Readonly<Record<string, string>>;
  readonly endpoints?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
}

/** Container health command and positive retry timing.
 * @example const check: LocalServiceHealthCheck = { command: ["true"], intervalMs: 1000, timeoutMs: 500, retries: 3 };
 */
export interface LocalServiceHealthCheck {
  readonly command: readonly string[];
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly retries: number;
}

/** Legacy single-container volume mount.
 * @example const volume: LocalServiceVolume = { mountPath: "/data" };
 */
export interface LocalServiceVolume {
  readonly mountPath: string;
}

/** Generated secret byte length and encoding.
 * @example const secret: LocalServiceGeneratedSecret = { bytes: 32, encoding: "hex" };
 */
export interface LocalServiceGeneratedSecret {
  readonly bytes: number;
  readonly encoding?: "base64url" | "hex";
}

/** Reference to a declared generated secret.
 * @example const password: LocalServiceSecretEnvironment = { secret: "password" };
 */
export interface LocalServiceSecretEnvironment {
  readonly secret: string;
  readonly value?: never;
}

/** Literal environment value without a secret reference.
 * @example const level: LocalServiceLiteralEnvironment = { value: "debug" };
 */
export interface LocalServiceLiteralEnvironment {
  readonly value: string;
  readonly secret?: never;
}

/** Named composite volume and persistence policy.
 * @example const volume: CompositeLocalServiceVolume = { mountPath: "/data", persistent: true };
 */
export interface CompositeLocalServiceVolume {
  readonly mountPath: string;
  readonly persistent?: boolean;
}

/** Mount of one named composite volume into a unit.
 * @example const mount: CompositeLocalServiceUnitVolume = { name: "data", mountPath: "/data" };
 */
export interface CompositeLocalServiceUnitVolume {
  readonly name: string;
  readonly mountPath: string;
}

/** Host path mounted into a local-service unit.
 * @example const mount: LocalServiceBindMount = { source: "/tmp/data", target: "/data", readOnly: true };
 */
export interface LocalServiceBindMount {
  readonly source: string;
  readonly target: string;
  readonly readOnly?: boolean;
}

/** Built worker inputs used by a local materializer.
 * @example const artifact: LocalServiceWorkerArtifact = { entrypoint: "worker.js", providerOverridesFile: "overrides.json" };
 */
export interface LocalServiceWorkerArtifact {
  readonly entrypoint: string;
  readonly nodeModulesDirectory?: string;
  readonly providerOverridesFile: string;
  readonly environment?: Readonly<Record<string, string>>;
}

/** Supported unit roles in a composite recipe.
 * @example const kind: CompositeLocalServiceUnitKind = "worker";
 */
export type CompositeLocalServiceUnitKind = "container" | "init" | "worker";

/** Container, initializer, or worker declaration.
 * Dependencies refer to other unit IDs in the same composite recipe.
 * @example const unit: CompositeLocalServiceUnit = { id: "api", kind: "container", image: "api" };
 */
export interface CompositeLocalServiceUnit {
  readonly id: string;
  readonly kind: CompositeLocalServiceUnitKind;
  readonly image: string;
  readonly command?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly ports?: Readonly<Record<string, number>>;
  readonly volumes?: readonly CompositeLocalServiceUnitVolume[];
  readonly environment?: Readonly<
    Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>
  >;
  readonly health?: LocalServiceHealthCheck;
  readonly networkAliases?: readonly string[];
  readonly hostAliases?: Readonly<Record<string, string>>;
}

/** Version 2 recipe with ordered units and optional shared resources.
 * Supply either a flat `units` list or the grouped container, init, and worker fields.
 * @example normalizeLocalServiceRecipe(recipe as CompositeLocalServiceRecipe);
 */
export interface CompositeLocalServiceRecipe<IntegrationId extends string = string> {
  readonly kind: "local-service-recipe";
  readonly protocolVersion: typeof LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION;
  readonly integrationId: IntegrationId;
  readonly recipeId: string;
  readonly recipeVersion: 2;
  readonly materializerId: "docker";
  /** A flat unit list is preferred; grouped fields keep recipes readable. */
  readonly units?: readonly CompositeLocalServiceUnit[];
  readonly containers?: readonly Omit<CompositeLocalServiceUnit, "kind">[];
  readonly init?: readonly Omit<CompositeLocalServiceUnit, "kind">[];
  readonly workers?: readonly Omit<CompositeLocalServiceUnit, "kind">[];
  readonly volumes: Readonly<Record<string, CompositeLocalServiceVolume>>;
  readonly generatedSecrets?: Readonly<Record<string, LocalServiceGeneratedSecret>>;
  readonly environment?: Readonly<
    Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>
  >;
  readonly network?: Readonly<{ readonly internal?: boolean }>;
  readonly ownership?: Readonly<{
    readonly scope: "project" | "binding";
    readonly retainVolumes?: boolean;
  }>;
  readonly outputs: (
    context: LocalServiceRecipeOutputContext,
  ) => Readonly<Record<string, JsonValue>>;
  readonly initialize?: (context: LocalServiceRecipeOutputContext) => Promise<void>;
}

/** Either supported local recipe form.
 * @example normalizeLocalServiceRecipe(recipe as LocalServiceRecipeInput);
 */
export type LocalServiceRecipeInput<IntegrationId extends string = string> =
  LocalServiceRecipe<IntegrationId> | CompositeLocalServiceRecipe<IntegrationId>;

/** Version 1 single-container recipe kept for compatibility.
 * Its output and initialization callbacks run in the materializer, not during normalization.
 * @example normalizeLocalServiceRecipe(recipe as LocalServiceRecipe);
 */
export interface LocalServiceRecipe<IntegrationId extends string = string> {
  readonly kind: "local-service-recipe";
  readonly protocolVersion: typeof LOCAL_SERVICE_PROTOCOL_VERSION;
  readonly integrationId: IntegrationId;
  readonly recipeId: string;
  readonly recipeVersion: number;
  readonly materializerId: "docker";
  readonly image: string;
  readonly command?: readonly string[];
  readonly ports: Readonly<Record<string, number>>;
  readonly volume?: LocalServiceVolume;
  readonly health: LocalServiceHealthCheck;
  readonly generatedSecrets?: Readonly<Record<string, LocalServiceGeneratedSecret>>;
  readonly environment?: Readonly<Record<string, LocalServiceSecretEnvironment>>;
  readonly outputs: (
    context: LocalServiceRecipeOutputContext,
  ) => Readonly<Record<string, JsonValue>>;
  readonly initialize?: (context: LocalServiceRecipeOutputContext) => Promise<void>;
}
