import type {
  DependencyBridge,
  DependencyClientSources,
  DependencyDeclarations,
  DirectFunctionInvoker,
} from "./dependencies.js";
import { buildDependencyClients } from "./dependencies.js";

export interface InvocationContextBase {
  readonly invocation: unknown;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly log: unknown;
  readonly time: unknown;
}

export interface ContextBuildOptions {
  readonly ownerId: string;
  readonly dependencies?: DependencyDeclarations;
  readonly clients?: DependencyClientSources;
  readonly bridge?: DependencyBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: () => string | undefined;
  readonly causationInvocationId?: () => string | undefined;
  readonly traceId?: () => string | undefined;
  readonly now?: () => Date;
  readonly invokeFunction?: DirectFunctionInvoker;
  readonly onDeclaredEdge?: (edge: import("@relkit/graph").GraphEdge) => void;
  readonly onObservedEdge?: (edge: import("@relkit/graph").ObservedEdge) => void;
  readonly onOperation?: (
    operation:
      | import("@relkit/buckets").BucketOperationObservation
      | import("@relkit/cache").CacheOperationObservation,
  ) => void;
}

/** Replaces the six client maps with frozen maps derived only from declarations. */
export function createContext<Context extends { readonly signal: AbortSignal }>(
  base: Context,
  options: ContextBuildOptions,
): Context {
  const clients = buildDependencyClients({
    ownerId: options.ownerId,
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
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
    ...(options.invokeFunction === undefined ? {} : { invokeFunction: options.invokeFunction }),
    ...(options.onDeclaredEdge === undefined ? {} : { onDeclaredEdge: options.onDeclaredEdge }),
    ...(options.onObservedEdge === undefined ? {} : { onObservedEdge: options.onObservedEdge }),
    ...(options.onOperation === undefined ? {} : { onOperation: options.onOperation }),
  });
  return Object.freeze({
    ...base,
    jobs: clients.jobs,
    events: clients.events,
    buckets: clients.buckets,
    cache: clients.cache,
    agents: clients.agents,
  }) as Context;
}

function sourceMaps(base: InvocationContextBase): DependencyClientSources {
  const value = base as InvocationContextBase & Record<string, unknown>;
  return {
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
