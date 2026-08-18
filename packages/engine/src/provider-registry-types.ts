import type { MaybePromise, SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import type { ProviderCapability, ProviderRecipe, ProviderSet, ProviderSets } from "@zsys/app";

export const PROVIDER_RECIPES = {
  development: "local",
  test: "test",
  production: "aws",
} as const;
export type ProviderEnvironment = keyof typeof PROVIDER_RECIPES;

export interface ProviderFactoryContext {
  readonly generationId: string;
  readonly environment: ProviderEnvironment;
  readonly providerSet: ProviderSet;
  readonly values?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}
export interface ProviderGeneration {
  readonly providers?: Readonly<Partial<Record<ProviderCapability, unknown>>>;
  readonly ready?: () => MaybePromise<void>;
  readonly readiness?: () => MaybePromise<void>;
  readonly release?: () => MaybePromise<void>;
  readonly dispose?: () => MaybePromise<void>;
}
export interface ProviderFactory {
  readonly recipeTag: ProviderRecipe;
  readonly create: (context: ProviderFactoryContext) => MaybePromise<ProviderGeneration>;
  readonly ready?: (generation: ProviderGeneration) => MaybePromise<void>;
  readonly release?: (generation: ProviderGeneration) => MaybePromise<void>;
}
export type ProviderFactories = Partial<Record<ProviderRecipe, ProviderFactory>>;

export interface ProviderRequirement {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly source?: SourceLocation;
}
export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly value: unknown;
}
export interface ProviderRegistryOptions {
  readonly generationId: string;
  readonly environment: ProviderEnvironment;
  readonly providers?: ProviderSets;
  readonly providerSets?: ProviderSets;
  readonly graph: ApplicationGraph;
  readonly factories?: ProviderFactories;
  readonly values?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}
export interface ProviderRegistry {
  readonly generationId: string;
  readonly environment: ProviderEnvironment;
  readonly recipeTag: ProviderRecipe;
  readonly providerSet: ProviderSet;
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
  | "ZSYS_PROVIDER_ABORTED";
export interface ProviderRegistryIssue {
  readonly code: ProviderRegistryErrorCode;
  readonly message: string;
  readonly capability?: ProviderCapability;
  readonly profile?: string;
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
