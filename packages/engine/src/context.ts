import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import type { ContextBuildOptions, InvocationContextBase } from "./context.types.js";
import type { DependencyClientSources } from "./dependencies.js";
import { buildDependencyClientsEffect } from "./dependencies.js";
import { runEngineSync } from "./engine-runtime.js";
export type { ContextBuildOptions, InvocationContextBase } from "./context.types.js";

/** Replaces the six client maps with frozen maps derived only from declarations.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns The frozen base context with guarded dependency maps and optional trigger/progress fields.
 * @param base - Base handler context before guarded client maps are installed.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createContext<Context extends { readonly signal: AbortSignal }>(
  base: Context,
  options: ContextBuildOptions,
): Context {
  return runEngineSync(createContextEffect<Context>(base, options));
}

/** Compose createContext with the caller's Effect diagnostics and dependencies.
 * @param base - Validated base handler context.
 * @param options - Explicit operation configuration.
 * @returns A lazy Effect yielding the frozen context and propagating declared-client validation failures.
 * @typeParam Context - Handler context carrying cancellation authority.
 */
export const createContextEffect = Effect.fn("Engine.createContext")(
  <Context extends { readonly signal: AbortSignal }>(base: Context, options: ContextBuildOptions) =>
    observeExecution(
      "engine",
      "createContext",
      Effect.gen(function* () {
        const clients = yield* buildDependencyClientsEffect({
          ownerId: options.ownerId,
          ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
          ...(options.publications === undefined ? {} : { publications: options.publications }),
          sources: options.clients ?? sourceMaps(base as unknown as InvocationContextBase),
          ...(options.bridge === undefined ? {} : { bridge: options.bridge }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
          ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
          ...(options.causationInvocationId === undefined
            ? {}
            : { causationInvocationId: options.causationInvocationId }),
          ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(options.invokeFunction === undefined
            ? {}
            : { invokeFunction: options.invokeFunction }),
          ...(options.invokeTask === undefined ? {} : { invokeTask: options.invokeTask }),
          ...(options.onDeclaredEdge === undefined
            ? {}
            : { onDeclaredEdge: options.onDeclaredEdge }),
          ...(options.onObservedEdge === undefined
            ? {}
            : { onObservedEdge: options.onObservedEdge }),
          ...(options.onOperation === undefined ? {} : { onOperation: options.onOperation }),
        });
        return Object.freeze({
          ...base,
          tasks: clients.tasks,
          jobs: clients.jobs,
          events: clients.events,
          buckets: clients.buckets,
          cache: clients.cache,
          agents: clients.agents,
          ...(options.trigger === undefined ? {} : { trigger: options.trigger }),
          ...(options.progress === undefined ? {} : { progress: options.progress }),
        }) as Context;
      }),
    ),
);

/** Extract native client sources before replacing them with guarded declarations.
 * @returns Native sources for the supported dependency categories.
 * @param base - Base handler context before guarded client maps are installed.
 */
function sourceMaps(base: InvocationContextBase): DependencyClientSources {
  const value = base as InvocationContextBase & Record<string, unknown>;
  return {
    ...(value.tasks === undefined
      ? {}
      : { tasks: value.tasks as Readonly<Record<string, unknown>> }),
    ...(value.jobs === undefined ? {} : { jobs: value.jobs as Readonly<Record<string, unknown>> }),
    ...(value.events === undefined
      ? {}
      : { events: value.events as Readonly<Record<string, unknown>> }),
    ...(value.buckets === undefined
      ? {}
      : { buckets: value.buckets as Readonly<Record<string, unknown>> }),
    ...(value.cache === undefined
      ? {}
      : { cache: value.cache as Readonly<Record<string, unknown>> }),
    ...(value.agents === undefined
      ? {}
      : { agents: value.agents as Readonly<Record<string, unknown>> }),
  };
}
