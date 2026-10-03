import type {
  GenerationRuntimeOptions,
  GenerationService,
  GenerationRuntimeServices,
  ManagedGeneration,
  GenerationEnvironmentResolverContract,
} from "./runtime.types.js";
export type {
  GenerationRuntimeOptions,
  GenerationService,
  GenerationRuntimeServices,
  ManagedGeneration,
} from "./runtime.types.js";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { resolveEnvWithEffectEffect } from "@relkit/config/internal/config";
import type { EnvDefinition, EnvShape, EnvSource, ResolvedEnv } from "@relkit/config";
import {
  validateGenerationOptions,
  validateGenerationOptionsEffect,
} from "./runtime-validation.js";
import { Graph, Manifest } from "./services.js";
import { observeExecution } from "./operation.js";
import { createLoggerLayer } from "./logger.js";
import {
  GenerationEnvironment,
  GenerationServices,
  generationServicesLayer,
  orderGenerationServices,
  interruptOnSignal,
} from "./scope.js";

/** Started environment and resource registry belonging to one runtime scope. */
export class Generation extends Context.Service<Generation, GenerationService>()(
  "relkit/runtime/Generation",
) {}

/** Environment resolution dependency, replaceable before generation acquisition. */
export class GenerationEnvironmentResolver extends Context.Service<
  GenerationEnvironmentResolver,
  GenerationEnvironmentResolverContract
>()("relkit/runtime/GenerationEnvironmentResolver") {}

/** Uses RELKIT's Config parser without introducing implicit environment reads. */
export const GenerationEnvironmentResolverLive = Layer.effect(
  GenerationEnvironmentResolver,
  Effect.succeed(
    GenerationEnvironmentResolver.of({
      resolve: Effect.fn("GenerationEnvironment.resolve")(
        <S extends EnvShape>(
          definition: EnvDefinition<S>,
          source: EnvSource,
          environment: string,
        ) =>
          observeExecution(
            "runtime",
            "environment.resolve",
            resolveEnvWithEffectEffect(definition, source, environment),
          ),
      ),
    }),
  ),
);

/**
 * Creates and eagerly starts one managed runtime for one backend generation.
 * @typeParam S - The environment definition's field shape.
 * @param options - Explicit configuration and generation-owned resources.
 * @returns A started generation whose disposal closes its scope once.
 * @remarks Acquired resources roll back in reverse order if startup fails.
 * @example
 * ```ts
 * import { createGenerationRuntime, Generation, type GenerationRuntimeOptions } from "@relkit/runtime-effect";
 * async function start(options: GenerationRuntimeOptions<{}>) {
 *   const generation = await createGenerationRuntime(options);
 *   try { return await generation.runtime.runPromise(Generation); }
 *   finally { await generation.dispose(); }
 * }
 * ```
 */
export async function createGenerationRuntime<S extends EnvShape>(
  options: GenerationRuntimeOptions<S>,
): Promise<ManagedGeneration<S>> {
  validateGenerationOptions(options);
  orderGenerationServices(options.services ?? []);
  const logging = createLoggerLayer(options.logger ?? { human: false, json: false });
  const runtime = ManagedRuntime.make(
    Layer.merge(generationLayer(options).pipe(Layer.provide(logging)), logging),
  );
  let disposal: Promise<void> | undefined;
  /** Closes the owning runtime once, sharing settlement with concurrent callers.
   * @returns The generation's memoized completion of scope finalization.
   */
  const dispose = (): Promise<void> => {
    disposal ??= runtime.dispose();
    return disposal;
  };

  try {
    const generation = await runtime.runPromise(
      Generation,
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

/**
 * Composes a generation in the caller's owning scope without running it.
 * @typeParam S - The configured environment field shape.
 * @param options - Explicit generation configuration and resource definitions.
 * @param resolver - Environment dependency supplied once for the generation.
 * @returns A lazy Layer exposing the generation and its compatibility services.
 * @remarks Tests can replace the environment resolver before building this Layer.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Generation, generationLayer, type GenerationRuntimeOptions } from "@relkit/runtime-effect";
 * const useGeneration = (options: GenerationRuntimeOptions<{}>) =>
 *   Effect.scoped(Generation.pipe(Effect.provide(generationLayer(options))));
 * ```
 */
export function generationLayer<S extends EnvShape>(
  options: GenerationRuntimeOptions<S>,
  resolver: Layer.Layer<GenerationEnvironmentResolver, unknown> = GenerationEnvironmentResolverLive,
): Layer.Layer<GenerationRuntimeServices, unknown> {
  const environmentLayer = generationEnvironmentLayer(options).pipe(Layer.provide(resolver));
  const servicesLayer = generationServicesLayer(options.services ?? []).pipe(
    Layer.provide(environmentLayer),
  );
  const baseLayer = Layer.mergeAll(
    Layer.succeed(Graph, Graph.of({ graph: options.graph, graphHash: options.graphHash })),
    Layer.succeed(Manifest, Manifest.of({ manifest: Object.freeze(options.manifest) })),
    environmentLayer,
    servicesLayer,
  );
  return Layer.effect(
    Generation,
    observeExecution(
      "runtime",
      "generation.acquire",
      Effect.gen(function* () {
        const environment = yield* GenerationEnvironment;
        const services = yield* GenerationServices;
        return Generation.of({ environment: environment.values, services });
      }),
    ),
  ).pipe(Layer.provideMerge(baseLayer));
}

/**
 * Resolves configured fields through the existing Config service.
 * @typeParam S - The configured field shape.
 * @param options - Explicit source and environment selection.
 * @returns A lazy environment Layer; no implicit file or process reads occur.
 */
function generationEnvironmentLayer<S extends EnvShape>(options: GenerationRuntimeOptions<S>) {
  return Layer.effect(
    GenerationEnvironment,
    interruptOnSignal(
      observeExecution(
        "runtime",
        "environment.acquire",
        Effect.gen(function* () {
          yield* validateGenerationOptionsEffect(options).pipe(
            Effect.catchTag("GenerationConfigurationError", (error) => Effect.fail(error.cause)),
          );
          const resolver = yield* GenerationEnvironmentResolver;
          return yield* resolver.resolve(options.env, options.source, options.environment);
        }),
      ),
      options.signal,
    ).pipe(
      Effect.map((values) =>
        GenerationEnvironment.of({
          values: Object.freeze(values),
          signal: options.signal,
        }),
      ),
    ),
  );
}
