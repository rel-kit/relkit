import type { JsonValue } from "@relkit/contracts";
import type { LOCAL_SERVICE_PROTOCOL_VERSION } from "./index.js";

/** Version used by composite recipes; single-container recipes remain on v1. */
export const LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION = 2 as const;

export interface LocalServiceRecipeOutputContext {
  readonly ports: Readonly<Record<string, number>>;
  readonly secrets: Readonly<Record<string, string>>;
  readonly endpoints?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
}

export interface LocalServiceHealthCheck {
  readonly command: readonly string[];
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly retries: number;
}

export interface LocalServiceVolume {
  readonly mountPath: string;
}

export interface LocalServiceGeneratedSecret {
  readonly bytes: number;
  readonly encoding?: "base64url" | "hex";
}

export interface LocalServiceSecretEnvironment {
  readonly secret: string;
  readonly value?: never;
}

export interface LocalServiceLiteralEnvironment {
  readonly value: string;
  readonly secret?: never;
}

export interface CompositeLocalServiceVolume {
  readonly mountPath: string;
  readonly persistent?: boolean;
}

export interface CompositeLocalServiceUnitVolume {
  readonly name: string;
  readonly mountPath: string;
}

export interface LocalServiceBindMount {
  readonly source: string;
  readonly target: string;
  readonly readOnly?: boolean;
}

export interface LocalServiceWorkerArtifact {
  readonly entrypoint: string;
  readonly providerOverridesFile: string;
  readonly environment?: Readonly<Record<string, string>>;
}

export type CompositeLocalServiceUnitKind = "container" | "init" | "worker";

export interface CompositeLocalServiceUnit {
  readonly id: string;
  readonly kind: CompositeLocalServiceUnitKind;
  readonly image: string;
  readonly command?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly ports?: Readonly<Record<string, number>>;
  readonly volumes?: readonly CompositeLocalServiceUnitVolume[];
  readonly environment?: Readonly<Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>>;
  readonly health?: LocalServiceHealthCheck;
  readonly networkAliases?: readonly string[];
  readonly hostAliases?: Readonly<Record<string, string>>;
}

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
  readonly environment?: Readonly<Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>>;
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

export type LocalServiceRecipeInput<IntegrationId extends string = string> =
  | LocalServiceRecipe<IntegrationId>
  | CompositeLocalServiceRecipe<IntegrationId>;

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

export interface LocalServiceInstance {
  readonly id: string;
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly state: string;
  readonly health?: "starting" | "healthy" | "unhealthy";
  readonly ports: Readonly<Record<string, number>>;
  readonly unitId?: string;
  readonly units?: readonly LocalServiceInstance[];
  readonly networkName?: string;
  readonly environment?: string;
  readonly serviceGeneration?: string;
}

export interface LocalServiceStartRequest {
  readonly name: string;
  readonly volumeName?: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly recipe: LocalServiceRecipeInput;
  readonly environmentFile?: string;
  readonly environmentFiles?: Readonly<Record<string, string>>;
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly volumeNames?: Readonly<Record<string, string>>;
  readonly networkName?: string;
  readonly serviceGeneration?: string;
  readonly workerArtifact?: LocalServiceWorkerArtifact;
  readonly bindMounts?: Readonly<Record<string, readonly LocalServiceBindMount[]>>;
  readonly environmentVariablesByUnit?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly signal?: AbortSignal;
}

export interface LocalServiceMaterializerRuntime {
  readonly kind: "local-service-materializer-runtime";
  readonly protocolVersion: typeof LOCAL_SERVICE_PROTOCOL_VERSION;
  readonly integrationId: string;
  readonly list: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<readonly LocalServiceInstance[]>;
  readonly start: (request: LocalServiceStartRequest) => Promise<LocalServiceInstance>;
  readonly stop?: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly remove: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly removeVolumes: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly listVolumes?: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<
    readonly { readonly name: string; readonly labels: Readonly<Record<string, string>> }[]
  >;
  readonly removeNetworks?: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<void>;
}
