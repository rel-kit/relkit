import type { EnvMetadata, ProviderBinding, ProviderCapability, ProviderTopology } from "@zsys/app";
import type { MaybePromise, SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";

export type ProviderEnvironment = "development" | "test" | "production";

export interface ProviderFactoryContext {
  readonly generationId: string;
  readonly environment: ProviderEnvironment;
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly binding: ProviderBinding;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface ProviderGeneration {
  readonly value?: unknown;
  readonly modelRegistry?: unknown;
  readonly ready?: () => MaybePromise<void>;
  readonly readiness?: () => MaybePromise<void>;
  readonly release?: () => MaybePromise<void>;
  readonly dispose?: () => MaybePromise<void>;
}

export interface ProviderFactory {
  readonly capability: ProviderCapability;
  readonly adapter: string;
  readonly create: (context: ProviderFactoryContext) => MaybePromise<ProviderGeneration>;
  readonly ready?: (generation: ProviderGeneration) => MaybePromise<void>;
  readonly release?: (generation: ProviderGeneration) => MaybePromise<void>;
}

export type ProviderFactories = Readonly<Record<string, ProviderFactory>>;

export interface ProviderRequirement {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly bindingId: string;
  readonly source?: SourceLocation;
}

export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly binding: ProviderBinding;
  readonly value: unknown;
}

export interface ProviderRegistryOptions {
  readonly generationId: string;
  readonly environment: ProviderEnvironment;
  readonly providers: ProviderTopology;
  readonly graph: ApplicationGraph;
  readonly factories?: ProviderFactories;
  readonly testFactories?: ProviderFactories;
  readonly useConfiguredAdaptersInTests?: boolean;
  readonly values?: Readonly<Record<string, unknown>>;
  readonly environmentMetadata?: Readonly<Record<string, EnvMetadata>>;
  readonly signal?: AbortSignal;
}

export interface ProviderRegistry {
  readonly generationId: string;
  readonly environment: ProviderEnvironment;
  readonly providers: ProviderTopology;
  readonly modelRegistry?: unknown;
  readonly requirements: readonly ProviderRequirement[];
  readonly handles: Readonly<Record<string, ProviderHandle>>;
  readonly get: (capability: ProviderCapability, profile: string) => ProviderHandle | undefined;
  readonly resolve: (capability: ProviderCapability, profile: string) => ProviderHandle;
  readonly release: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export type ProviderRegistryErrorCode =
  | "ZSYS_PROVIDER_ENVIRONMENT_INVALID"
  | "ZSYS_PROVIDER_METADATA_INVALID"
  | "ZSYS_PROVIDER_PROFILE_UNKNOWN"
  | "ZSYS_PROVIDER_FACTORY_MISSING"
  | "ZSYS_PROVIDER_FACTORY_MISMATCH"
  | "ZSYS_PROVIDER_CONSTRUCTION_FAILED"
  | "ZSYS_PROVIDER_READINESS_FAILED"
  | "ZSYS_PROVIDER_RELEASE_FAILED"
  | "ZSYS_PROVIDER_ABORTED"
  | "ZSYS_MODEL_PROVIDER_REGISTRY_INVALID"
  | "ZSYS_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "ZSYS_MODEL_PROVIDER_UNSUPPORTED"
  | "ZSYS_MODEL_PROVIDER_ENVIRONMENT_INVALID"
  | "ZSYS_MODEL_PROVIDER_MODEL_UNAVAILABLE"
  | "ZSYS_MODEL_SELECTOR_INVALID"
  | "ZSYS_MODEL_PROVIDER_UNKNOWN"
  | "ZSYS_MODEL_PROVIDER_DEFAULT_MISSING";

export interface ProviderRegistryIssue {
  readonly code: ProviderRegistryErrorCode;
  readonly message: string;
  readonly capability?: ProviderCapability;
  readonly profile?: string;
  readonly agentId?: string;
  readonly variable?: string;
  readonly source?: SourceLocation;
}

export class ProviderRegistryError extends Error {
  readonly code: ProviderRegistryErrorCode;
  readonly issues: readonly ProviderRegistryIssue[];

  constructor(issues: readonly ProviderRegistryIssue[]) {
    const stable = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(stable.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "ProviderRegistryError";
    this.code = stable[0]?.code ?? "ZSYS_PROVIDER_METADATA_INVALID";
    this.issues = stable;
  }
}
