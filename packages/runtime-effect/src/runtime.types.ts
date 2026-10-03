import type { Effect, ManagedRuntime } from "effect";
import type { EnvDefinition, EnvShape, EnvSource, ResolvedEnv } from "@relkit/config";
import type { ApplicationGraph } from "@relkit/graph";
import type { Graph, Manifest, RuntimeManifest } from "./services.js";
import type {
  GenerationEnvironment,
  GenerationServices,
  GenerationServiceDefinition,
  GenerationServiceRegistry,
} from "./scope.js";
import type { Generation } from "./runtime.js";
import type { LoggerOptions } from "./logger.types.js";

/** Explicit startup inputs; no source is inferred from process or local files.
 * @typeParam S - Environment field definitions resolved for this generation.
 */
export interface GenerationRuntimeOptions<S extends EnvShape = EnvShape> {
  readonly environment: string;
  readonly env: EnvDefinition<S>;
  /** Explicit values keep startup independent from implicit local env-file loading. */
  readonly source: EnvSource;
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
  readonly manifest: RuntimeManifest;
  readonly services?: readonly GenerationServiceDefinition[];
  /** Production containers must leave this false or unset. */
  readonly allowImplicitDotEnv?: boolean;
  readonly signal?: AbortSignal;
  /** Managed-runtime logger configuration; standalone startup defaults to quiet sinks.
   * Direct generationLayer composition retains the caller's logger Layer.
   */
  readonly logger?: LoggerOptions;
}

/** Environment and acquired resource registry exposed by the Generation service. */
export interface GenerationService {
  readonly environment: Readonly<Record<string, unknown>>;
  readonly services: GenerationServiceRegistry;
}

/** Internal dependencies retained in the generation-owned managed runtime. */
export type GenerationRuntimeServices =
  Graph | Manifest | GenerationEnvironment | GenerationServices | Generation;

/** Started generation with idempotent scope disposal.
 * @typeParam S - Environment fields resolved during acquisition.
 */
export interface ManagedGeneration<S extends EnvShape> {
  readonly runtime: ManagedRuntime.ManagedRuntime<GenerationRuntimeServices, unknown>;
  readonly environment: ResolvedEnv<S>;
  readonly services: GenerationServiceRegistry;
  readonly dispose: () => Promise<void>;
}

/** Replaceable environment parser; the source is always supplied explicitly. */
export interface GenerationEnvironmentResolverContract {
  /** Resolves the explicit source lazily in the caller's environment.
   * @typeParam S - Environment field definitions.
   * @param definition - Schema and defaults for the generation environment.
   * @param source - Explicit environment input without implicit process reads.
   * @param environment - Selected deployment environment.
   * @returns Resolved fields or the existing typed configuration failure.
   */
  readonly resolve: <S extends EnvShape>(
    definition: EnvDefinition<S>,
    source: EnvSource,
    environment: string,
  ) => Effect.Effect<ResolvedEnv<S>, unknown>;
}
