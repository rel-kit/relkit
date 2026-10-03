import type {
  GenerationEnvironmentService,
  GenerationServiceContext,
  GenerationServiceDefinition,
  GenerationServiceRegistry,
} from "./scope.types.js";
export type {
  GenerationEnvironmentService,
  GenerationServiceContext,
  GenerationServiceDefinition,
  GenerationServiceRegistry,
} from "./scope.types.js";
import { Context, Effect, Layer, Scope } from "effect";
import { observeExecution } from "./operation.js";

/** Generation environment acquired once before dependent resources. */
export class GenerationEnvironment extends Context.Service<
  GenerationEnvironment,
  GenerationEnvironmentService
>()("relkit/runtime/GenerationEnvironment") {}

/** Registry whose resources are finalized by the generation scope. */
export class GenerationServices extends Context.Service<
  GenerationServices,
  GenerationServiceRegistry
>()("relkit/runtime/GenerationServices") {}

/**
 * Orders resources before acquiring them, preserving declaration order for ties.
 * @param definitions - Resource definitions and their dependencies.
 * @returns A frozen dependency-first sequence.
 * @throws TypeError when identifiers, dependencies or cycles are invalid.
 */
export function orderGenerationServices(
  definitions: readonly GenerationServiceDefinition[],
): readonly GenerationServiceDefinition[] {
  const byId = new Map<string, GenerationServiceDefinition>();
  for (const definition of definitions) {
    if (definition.id.length === 0 || byId.has(definition.id)) {
      throw new TypeError(`Generation service ID must be unique: ${definition.id}`);
    }
    byId.set(definition.id, definition);
  }

  const pending = [...definitions];
  const resolved = new Set<string>();
  const ordered: GenerationServiceDefinition[] = [];
  while (pending.length > 0) {
    const index = pending.findIndex((definition) => {
      const dependencies = definition.dependencies ?? [];
      for (const dependency of dependencies) {
        if (!byId.has(dependency)) throw new TypeError(`Unknown generation service: ${dependency}`);
      }
      return dependencies.every((dependency) => resolved.has(dependency));
    });
    if (index < 0) throw new TypeError("Generation service dependencies contain a cycle");
    const [definition] = pending.splice(index, 1);
    if (definition === undefined) throw new TypeError("Generation service ordering failed");
    ordered.push(definition);
    resolved.add(definition.id);
  }
  return Object.freeze(ordered);
}

/**
 * Acquires resources once in the generation scope.
 * @param definitions - Ordered declarations, validated lazily when built.
 * @returns A Layer requiring the generation environment and owning all releases.
 * @remarks Partial startup and disposal release the acquired prefix in reverse order.
 * @example
 * ```ts
 * import { Effect, Layer } from "effect";
 * import { GenerationEnvironment, GenerationServices, generationServicesLayer } from "@relkit/runtime-effect";
 * const resources = generationServicesLayer([]).pipe(Layer.provide(
 *   Layer.succeed(GenerationEnvironment, { values: {}, signal: undefined })));
 * const registry = await Effect.runPromise(Effect.scoped(
 *   GenerationServices.pipe(Effect.provide(resources))));
 * ```
 */
export function generationServicesLayer(
  definitions: readonly GenerationServiceDefinition[],
): Layer.Layer<GenerationServices, unknown, GenerationEnvironment> {
  return Layer.effect(
    GenerationServices,
    observeExecution(
      "runtime",
      "services.acquire",
      Effect.fn("GenerationServices.acquire")(function* () {
        const ordered = yield* Effect.try({
          try: () => orderGenerationServices(definitions),
          catch: (cause) => cause,
        });
        const environment = yield* GenerationEnvironment;
        return yield* acquireGenerationServices(ordered, environment);
      })(),
      () => ({ resources: definitions.length }),
    ),
  );
}

/**
 * Registers releases as each acquisition succeeds.
 * @param definitions - Dependency-first resource definitions.
 * @param environment - Resolved values and startup cancellation.
 * @returns The immutable registry, requiring the owning Scope.
 */
function acquireGenerationServices(
  definitions: readonly GenerationServiceDefinition[],
  environment: GenerationEnvironmentService,
): Effect.Effect<GenerationServiceRegistry, unknown, Scope.Scope> {
  return Effect.gen(function* () {
    const values = new Map<string, unknown>();
    for (const definition of definitions) {
      const value = yield* Effect.acquireRelease(
        interruptOnSignal(
          observeExecution(
            "runtime",
            "service.acquire",
            Effect.suspend(() =>
              definition.acquire({
                environment: environment.values,
                signal: environment.signal,
                get: <A>(id: string): A => {
                  if (!values.has(id)) throw new Error(`Generation service is not acquired: ${id}`);
                  return values.get(id) as A;
                },
              }),
            ),
          ),
          environment.signal,
        ),
        (resource, exit) =>
          observeExecution(
            "runtime",
            "service.release",
            Effect.suspend(() => definition.release?.(resource, exit) ?? Effect.void),
          ),
        { interruptible: true },
      );
      values.set(definition.id, value);
    }

    const snapshot = Object.freeze(Object.fromEntries(values));
    return Object.freeze({
      order: Object.freeze(definitions.map(({ id }) => id)),
      values: snapshot,
      get: <A>(id: string): A | undefined => snapshot[id] as A | undefined,
    });
  });
}

/**
 * Connects a cancellable external boundary to an Effect workflow.
 * @typeParam A - The successful value.
 * @typeParam E - The workflow's existing typed failure.
 * @typeParam R - Required services, preserved across cancellation.
 * @param effect - Lazy work to race with the signal.
 * @param signal - Optional external cancellation signal.
 * @returns Work preserving its failure or failing with the signal's reason.
 * @remarks Listener lifetime follows the race; signal state is read at execution.
 */
export function interruptOnSignal<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  signal: AbortSignal | undefined,
): Effect.Effect<A, E | unknown, R> {
  if (signal === undefined) return effect;
  return Effect.suspend(() => {
    if (signal.aborted) return Effect.fail(signal.reason ?? new Error("Operation interrupted"));
    const aborted = Effect.callback<never, unknown>((resume) => {
      /** Resumes the cancellation branch with the signal's unchanged reason.
       * @returns Nothing; the race owns interruption and listener removal.
       */
      const onAbort = () =>
        resume(Effect.fail(signal.reason ?? new Error("Operation interrupted")));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      return Effect.sync(() => signal.removeEventListener("abort", onAbort));
    });
    return Effect.raceFirst(effect, aborted);
  });
}
