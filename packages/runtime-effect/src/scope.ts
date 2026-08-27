import { Context, Effect, Exit, Layer, Scope } from "effect";

export interface GenerationEnvironmentService {
  readonly values: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal | undefined;
}

export class GenerationEnvironment extends Context.Service<
  GenerationEnvironment,
  GenerationEnvironmentService
>()("relkit/runtime/GenerationEnvironment") {}

export interface GenerationServiceContext {
  readonly environment: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal | undefined;
  readonly get: <A = unknown>(id: string) => A;
}

export interface GenerationServiceDefinition<A = unknown> {
  readonly id: string;
  readonly dependencies?: readonly string[];
  readonly acquire: (context: GenerationServiceContext) => Effect.Effect<A, unknown>;
  readonly release?: (value: A, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, never>;
}

export interface GenerationServiceRegistry {
  readonly order: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly get: <A = unknown>(id: string) => A | undefined;
}

export class GenerationServices extends Context.Service<
  GenerationServices,
  GenerationServiceRegistry
>()("relkit/runtime/GenerationServices") {}

/** Returns dependency-first order while preserving declaration order for ties. */
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

export function generationServicesLayer(
  definitions: readonly GenerationServiceDefinition[],
): Layer.Layer<GenerationServices, unknown, GenerationEnvironment> {
  const ordered = orderGenerationServices(definitions);
  return Layer.effect(
    GenerationServices,
    Effect.gen(function* () {
      const environment = yield* GenerationEnvironment;
      return yield* acquireGenerationServices(ordered, environment);
    }),
  );
}

function acquireGenerationServices(
  definitions: readonly GenerationServiceDefinition[],
  environment: GenerationEnvironmentService,
): Effect.Effect<GenerationServiceRegistry, unknown, Scope.Scope> {
  return Effect.gen(function* () {
    const values = new Map<string, unknown>();
    for (const definition of definitions) {
      const value = yield* Effect.acquireRelease(
        interruptOnSignal(
          definition.acquire({
            environment: environment.values,
            signal: environment.signal,
            get: <A>(id: string): A => {
              if (!values.has(id)) throw new Error(`Generation service is not acquired: ${id}`);
              return values.get(id) as A;
            },
          }),
          environment.signal,
        ),
        (resource, exit) => definition.release?.(resource, exit) ?? Effect.void,
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

export function interruptOnSignal<A, E>(
  effect: Effect.Effect<A, E>,
  signal: AbortSignal | undefined,
): Effect.Effect<A, E | unknown> {
  if (signal === undefined) return effect;
  if (signal.aborted) return Effect.fail(signal.reason ?? new Error("Operation interrupted"));

  const aborted = Effect.callback<never, unknown>((resume) => {
    const onAbort = () => resume(Effect.fail(signal.reason ?? new Error("Operation interrupted")));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    return Effect.sync(() => signal.removeEventListener("abort", onAbort));
  });
  return Effect.raceFirst(effect, aborted);
}
