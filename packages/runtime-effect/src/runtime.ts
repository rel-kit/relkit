import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { resolveEnvWithEffect } from "@relkit/config/internal/config";
import type { EnvDefinition, EnvShape, EnvSource, ResolvedEnv } from "@relkit/config";
import type { ApplicationGraph } from "@relkit/graph";
import { Graph, Manifest, type RuntimeManifest } from "./services.js";
import {
  GenerationEnvironment,
  GenerationServices,
  generationServicesLayer,
  interruptOnSignal,
  type GenerationServiceDefinition,
  type GenerationServiceRegistry,
} from "./scope.js";

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
}

export interface GenerationService {
  readonly environment: Readonly<Record<string, unknown>>;
  readonly services: GenerationServiceRegistry;
}

export class Generation extends Context.Service<Generation, GenerationService>()(
  "relkit/runtime/Generation",
) {}

export type GenerationRuntimeServices =
  Graph | Manifest | GenerationEnvironment | GenerationServices | Generation;

export interface ManagedGeneration<S extends EnvShape> {
  readonly runtime: ManagedRuntime.ManagedRuntime<GenerationRuntimeServices, unknown>;
  readonly environment: ResolvedEnv<S>;
  readonly services: GenerationServiceRegistry;
  readonly dispose: () => Promise<void>;
}

/** Creates and eagerly starts one managed runtime for one backend generation. */
export async function createGenerationRuntime<S extends EnvShape>(
  options: GenerationRuntimeOptions<S>,
): Promise<ManagedGeneration<S>> {
  validateOptions(options);
  const graphService = Object.freeze({ graph: options.graph, graphHash: options.graphHash });
  const manifestService = Object.freeze({ manifest: Object.freeze(options.manifest) });
  const environmentLayer = Layer.effect(
    GenerationEnvironment,
    interruptOnSignal(
      Effect.tryPromise(() =>
        resolveEnvWithEffect(options.env, options.source, options.environment),
      ),
      options.signal,
    ).pipe(Effect.map((values) => ({ values: Object.freeze(values), signal: options.signal }))),
  );
  const servicesLayer = generationServicesLayer(options.services ?? []).pipe(
    Layer.provide(environmentLayer),
  );
  const baseLayer = Layer.mergeAll(
    Layer.succeed(Graph, graphService),
    Layer.succeed(Manifest, manifestService),
    environmentLayer,
    servicesLayer,
  );
  const generationLayer = Layer.effect(
    Generation,
    Effect.gen(function* () {
      const environment = yield* GenerationEnvironment;
      const services = yield* GenerationServices;
      return Generation.of({ environment: environment.values, services });
    }),
  ).pipe(Layer.provideMerge(baseLayer));
  const runtime = ManagedRuntime.make(generationLayer);
  let disposal: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposal ??= runtime.dispose();
    return disposal;
  };

  try {
    const generation = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* Generation;
      }),
      options.signal === undefined ? undefined : { signal: options.signal },
    );
    return {
      runtime,
      environment: generation.environment as ResolvedEnv<S>,
      services: generation.services,
      dispose,
    };
  } catch (cause) {
    await dispose().catch(() => undefined);
    throw cause;
  }
}

function validateOptions<S extends EnvShape>(options: GenerationRuntimeOptions<S>): void {
  if (options.environment === "production" && options.allowImplicitDotEnv === true) {
    throw new TypeError("Production generations require explicit environment values");
  }
  if (options.manifest.graphHash !== options.graphHash) {
    throw new TypeError("Runtime manifest graph hash does not match the application graph");
  }
}
