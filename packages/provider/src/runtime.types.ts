import type {
  JsonValue,
  MaybePromise,
  RuntimeIntegrationRegistrationMetadata,
} from "@relkit/contracts";

/** Binding data passed to a runtime provider generation. */
export interface RuntimeProviderContext {
  readonly generationId: string;
  readonly bindingId: string;
  readonly capability: string;
  readonly profile: string;
  readonly executionModel?: "task" | "legacy-function";
  readonly behavior: JsonValue;
  readonly connection: Readonly<Record<string, JsonValue>>;
  readonly signal?: AbortSignal;
}

/** Acquired runtime value and optional readiness and disposal hooks. */
export interface RuntimeProviderGeneration {
  readonly value: unknown;
  readonly ready?: () => MaybePromise<void>;
  readonly readiness?: () => MaybePromise<void>;
  readonly release?: () => MaybePromise<void>;
  readonly dispose?: () => MaybePromise<void>;
}

/** Registration factory for one runtime provider capability. */
export interface RuntimeProviderRegistration extends RuntimeIntegrationRegistrationMetadata {
  readonly create: (context: RuntimeProviderContext) => MaybePromise<RuntimeProviderGeneration>;
}

/** Collection of runtime provider registrations owned by an integration. */
export interface RuntimeProviderIntegration<IntegrationId extends string = string> {
  readonly kind: "runtime-integration";
  readonly integrationId: IntegrationId;
  readonly registrations: readonly RuntimeProviderRegistration[];
}
