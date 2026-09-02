import type { JsonValue, SourceLocation } from "@relkit/contracts";
import type { ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import type { RuntimeProviderGeneration } from "@relkit/provider";
import type { LoadedRuntimeIntegrationModule } from "./runtime-integrations.js";

export type ProviderCapability = ProviderBindingNode["capability"];
export type ProviderScopedValues = Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;
export type ProviderReplacements = Readonly<
  Partial<Record<ProviderCapability, Readonly<Record<string, RuntimeProviderGeneration>>>>
>;

export interface ProviderRequirement {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly bindingId: string;
  readonly binding: ProviderBindingNode;
  readonly source?: SourceLocation;
}

export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly binding: ProviderBindingNode;
  readonly value: unknown;
}

export interface ProviderRegistryOptions {
  readonly generationId: string;
  readonly graph: ApplicationGraph;
  readonly runtimeIntegrationModules: readonly LoadedRuntimeIntegrationModule[];
  readonly bindingValues?: Readonly<Record<string, JsonValue>>;
  readonly localBindingValues?: ProviderScopedValues;
  readonly infrastructureBindingValues?: ProviderScopedValues;
  readonly replacements?: ProviderReplacements;
  readonly signal?: AbortSignal;
}

export interface ProviderRegistry {
  readonly generationId: string;
  readonly requirements: readonly ProviderRequirement[];
  readonly handles: Readonly<Record<string, ProviderHandle>>;
  readonly get: (capability: ProviderCapability, profile: string) => ProviderHandle | undefined;
  readonly resolve: (capability: ProviderCapability, profile: string) => ProviderHandle;
  readonly release: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export interface AcquiredProvider {
  readonly binding: ProviderBindingNode;
  readonly generation: RuntimeProviderGeneration;
}

export type ProviderRegistryErrorCode =
  | "RELKIT_PROVIDER_METADATA_INVALID"
  | "RELKIT_PROVIDER_CONFIGURATION_INVALID"
  | "RELKIT_PROVIDER_PROFILE_UNKNOWN"
  | "RELKIT_PROVIDER_INTEGRATION_MISSING"
  | "RELKIT_PROVIDER_INTEGRATION_INVALID"
  | "RELKIT_PROVIDER_CONSTRUCTION_FAILED"
  | "RELKIT_PROVIDER_READINESS_FAILED"
  | "RELKIT_PROVIDER_RELEASE_FAILED"
  | "RELKIT_PROVIDER_ABORTED"
  | "RELKIT_MODEL_PROVIDER_REGISTRY_INVALID"
  | "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNSUPPORTED"
  | "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID"
  | "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE"
  | "RELKIT_MODEL_SELECTOR_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNKNOWN"
  | "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING";

export interface ProviderRegistryIssue {
  readonly code: ProviderRegistryErrorCode;
  readonly message: string;
  readonly capability?: ProviderCapability;
  readonly profile?: string;
  readonly agentId?: string;
  readonly source?: SourceLocation;
}

export class ProviderRegistryError extends Error {
  readonly code: ProviderRegistryErrorCode;
  readonly issues: readonly ProviderRegistryIssue[];

  constructor(issues: readonly ProviderRegistryIssue[]) {
    const stable = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(stable.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "ProviderRegistryError";
    this.code = stable[0]?.code ?? "RELKIT_PROVIDER_METADATA_INVALID";
    this.issues = stable;
  }
}
