import type { JsonValue, SourceLocation } from "@relkit/contracts";
import type { ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import type { RuntimeProviderGeneration } from "@relkit/provider";
import type { LoadedRuntimeIntegrationModule } from "./runtime-integrations.js";

/** Runtime capability families supported by graph provider bindings. */
export type ProviderCapability = ProviderBindingNode["capability"];

/** Connection values keyed by exact provider binding identity. */
export type ProviderScopedValues = Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;

/** Explicit provider test/replacement generations keyed by capability and profile. */
export type ProviderReplacements = Readonly<
  Partial<Record<ProviderCapability, Readonly<Record<string, RuntimeProviderGeneration>>>>
>;

/** A logical resource's validated capability/profile binding requirement. */
export interface ProviderRequirement {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly bindingId: string;
  readonly binding: ProviderBindingNode;
  readonly executionModel?: "task" | "legacy-function";
  readonly source?: SourceLocation;
}

/** Ready provider value together with its verified graph binding. */
export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly binding: ProviderBindingNode;
  readonly value: unknown;
}

/** One generation's graph, integration modules and explicit connection value sources. */
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

/** Ready generation providers with idempotent reverse-order release. */
export interface ProviderRegistry {
  readonly generationId: string;
  readonly requirements: readonly ProviderRequirement[];
  readonly handles: Readonly<Record<string, ProviderHandle>>;
  readonly get: (capability: ProviderCapability, profile: string) => ProviderHandle | undefined;
  readonly resolve: (capability: ProviderCapability, profile: string) => ProviderHandle;
  readonly release: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

/** Acquired generation retained for ordered compatibility cleanup. */
export interface AcquiredProvider {
  readonly binding: ProviderBindingNode;
  readonly generation: RuntimeProviderGeneration;
}

/** Stable public provider startup, lookup and release diagnostics. */
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
  | "RELKIT_PROVIDER_RUNTIME_INVALID"
  | "RELKIT_MODEL_PROVIDER_REGISTRY_INVALID"
  | "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNSUPPORTED"
  | "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID"
  | "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE"
  | "RELKIT_MODEL_SELECTOR_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNKNOWN"
  | "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING";

/** Safe provider diagnostic excluding native credentials and exception details. */
export interface ProviderRegistryIssue {
  readonly code: ProviderRegistryErrorCode;
  readonly message: string;
  readonly capability?: ProviderCapability;
  readonly profile?: string;
  readonly agentId?: string;
  readonly source?: SourceLocation;
}
