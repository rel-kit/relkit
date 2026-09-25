import { ContextFactoryFailure, makeContextEffect } from "./context.js";
import { Data, Effect } from "effect";
import { MANAGED_DEPENDENCY_CATEGORIES } from "./dispatcher-categories.js";
import type { StandaloneContextOptions } from "./dispatcher-context.types.js";
import type { ManagedDependencyCategory, ManagedDependencySources } from "./dispatcher-categories.types.js";
import { createLocalStructuredLogger } from "./local-logger.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";

/** Public error for accessing a managed client absent from standalone configuration.
 * @example throw new DependencyNotConfiguredError("cache", "main");
 */
export class DependencyNotConfiguredError extends Error {
  readonly code = "RELKIT_DEPENDENCY_NOT_CONFIGURED" as const;
  readonly category: ManagedDependencyCategory;
  readonly dependencyName: string;

  constructor(category: ManagedDependencyCategory, dependencyName: string) {
    super(`Managed dependency "${category}.${dependencyName}" has no configured standalone client`);
    this.name = "DependencyNotConfiguredError";
    this.category = category;
    this.dependencyName = dependencyName;
  }
}

/** Tagged missing managed dependency error in the Effect channel.
 * @example Effect.catchTag(readManagedDependencyEffect("cache", {}, "main"), "ManagedDependencyFailure", () => Effect.void);
 */
export class ManagedDependencyFailure extends Data.TaggedError("ManagedDependencyFailure")<{
  readonly cause: DependencyNotConfiguredError;
  readonly message: string;
}> {}

export { createLocalClock, createLocalClockEffect, LocalClockFailure } from "./local-clock.js";
export { createLocalStructuredLogger, createLocalStructuredLoggerEffect } from "./local-logger.js";

export type { StandaloneContextOptions } from "./dispatcher-context.types.js";

/** Builds a frozen standalone context with managed client maps.
 * @param options - Context factory, record, environment, clients, and logger.
 * @returns Handler context or tagged factory failure.
 * @example await Effect.runPromise(makeStandaloneContextEffect(options));
 */
export function makeStandaloneContextEffect<Context extends { readonly signal: AbortSignal }>(
  options: StandaloneContextOptions<Context>,
): Effect.Effect<Context, ContextFactoryFailure> {
  return observeInvocation("context.standalone", Effect.gen(function* () {
  const base = yield* makeContextEffect(
    options.factory,
    options.record,
    options.signal,
    options.env,
    options.time,
  );
  const installManagedMaps = options.factory === undefined || options.clients !== undefined;
  const managedMaps = installManagedMaps
    ? yield* createManagedMapsEffect(options.clients)
    : {};
  const events = yield* configuredMapEffect(
    "events",
    Object.fromEntries(options.publishes.flatMap((id) => {
      const source = options.clients?.events
        ?? (base as { events?: Readonly<Record<string, unknown>> }).events;
      return source !== undefined && Object.hasOwn(source, id) ? [[id, source[id]]] : [];
    })),
  );
  return Object.freeze({
    ...base,
    ...(options.logger === undefined && options.factory !== undefined
      ? {}
      : { log: options.logger ?? createLocalStructuredLogger(options.record, options.time) }),
    ...managedMaps,
    events,
    ...(options.progress === undefined ? {} : { progress: options.progress }),
  }) as Context;
  }));
}

/** Promise compatibility adapter for standalone context assembly.
 * @param options - Context factory, record, environment, clients, and logger.
 * @returns Frozen handler context.
 * @throws The original context factory error.
 * @example await makeStandaloneContext(options);
 */
export async function makeStandaloneContext<Context extends { readonly signal: AbortSignal }>(
  options: StandaloneContextOptions<Context>,
): Promise<Context> {
  try { return await Effect.runPromise(makeStandaloneContextEffect(options)); }
  catch (cause) {
    if (cause instanceof ContextFactoryFailure) throw cause.cause;
    throw cause;
  }
}

/** Builds managed category maps sequentially; mapping is pure and bounded.
 * @param sources - Optional configured clients.
 * @returns Category maps with no expected failure.
 * @example Effect.runSync(createManagedMapsEffect({ cache: { main: client } }));
 */
export function createManagedMapsEffect(
  sources: ManagedDependencySources | undefined,
): Effect.Effect<Readonly<Record<string, Readonly<Record<string, unknown>>>>> {
  return observeInvocation("context.managed-maps", Effect.gen(function* () {
    const entries: Array<[string, Readonly<Record<string, unknown>>]> = [];
    for (const category of MANAGED_DEPENDENCY_CATEGORIES)
      entries.push([category, yield* configuredMapEffect(category, sources?.[category])]);
    return Object.fromEntries(entries);
  }));
}

/** Creates a proxy that rejects missing managed clients through Effect.
 * @param category - Managed dependency category.
 * @param source - Configured clients in the category.
 * @returns An immutable proxy with no expected creation failure.
 * @example Effect.runSync(configuredMapEffect("cache", { main: client }));
 */
export function configuredMapEffect(
  category: ManagedDependencyCategory,
  source: Readonly<Record<string, unknown>> | undefined,
): Effect.Effect<Readonly<Record<string, unknown>>> {
  return observeInvocation("context.managed-map", Effect.sync(() => {
    const target = Object.freeze({ ...(source ?? {}) });
    return new Proxy(target, {
      get(current, property, receiver) {
        try { return runInvocationSync(readManagedDependencyEffect(category, current, property, receiver)); }
        catch (cause) {
          if (cause instanceof ManagedDependencyFailure) throw cause.cause;
          throw cause;
        }
      },
    });
  }));
}

/** Reads one managed client with a typed missing-client failure.
 * @param category - Managed dependency category.
 * @param target - Configured client map.
 * @param property - Requested property.
 * @param receiver - Proxy receiver.
 * @returns Configured client or `ManagedDependencyFailure`.
 * @example Effect.runSync(readManagedDependencyEffect("cache", { main: client }, "main"));
 */
export function readManagedDependencyEffect(
  category: ManagedDependencyCategory,
  target: Readonly<Record<string, unknown>>,
  property: PropertyKey,
  receiver?: unknown,
): Effect.Effect<unknown, ManagedDependencyFailure> {
  return observeInvocation("context.managed-get", Effect.suspend(() => {
    if (typeof property === "string" && !Object.hasOwn(target, property)) {
      const cause = new DependencyNotConfiguredError(category, property);
      return Effect.fail(new ManagedDependencyFailure({ cause, message: cause.message }));
    }
    return Effect.sync(() => Reflect.get(target, property, receiver));
  }));
}
