import type { JsonValue } from "@relkit/contracts";
import type { LOCAL_SERVICE_PROTOCOL_VERSION } from "./index.js";

export interface LocalServiceRecipeOutputContext {
  readonly ports: Readonly<Record<string, number>>;
  readonly secrets: Readonly<Record<string, string>>;
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
}

export interface LocalServiceSecretEnvironment {
  readonly secret: string;
}

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
}

export interface LocalServiceStartRequest {
  readonly name: string;
  readonly volumeName?: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly recipe: LocalServiceRecipe;
  readonly environmentFile?: string;
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
  readonly remove: (id: string, signal?: AbortSignal) => Promise<void>;
  readonly removeVolumes: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<void>;
}
