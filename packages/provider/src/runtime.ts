import type {
  JsonValue,
  MaybePromise,
  RuntimeIntegrationRegistrationMetadata,
} from "@relkit/contracts";

export interface RuntimeProviderContext {
  readonly generationId: string;
  readonly bindingId: string;
  readonly capability: string;
  readonly profile: string;
  readonly behavior: JsonValue;
  readonly connection: Readonly<Record<string, JsonValue>>;
  readonly signal?: AbortSignal;
}

export interface RuntimeProviderGeneration {
  readonly value: unknown;
  readonly ready?: () => MaybePromise<void>;
  readonly readiness?: () => MaybePromise<void>;
  readonly release?: () => MaybePromise<void>;
  readonly dispose?: () => MaybePromise<void>;
}

export interface RuntimeProviderRegistration extends RuntimeIntegrationRegistrationMetadata {
  readonly create: (context: RuntimeProviderContext) => MaybePromise<RuntimeProviderGeneration>;
}

export interface RuntimeProviderIntegration<IntegrationId extends string = string> {
  readonly kind: "runtime-integration";
  readonly integrationId: IntegrationId;
  readonly registrations: readonly RuntimeProviderRegistration[];
}
