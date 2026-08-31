import type { MaybePromise } from "@relkit/contracts";
import type { BucketOperationObservation } from "@relkit/buckets";
import type { CacheOperationObservation } from "@relkit/cache";
import type { GraphEdge, ObservedEdge } from "@relkit/graph";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { InvocationErrorDefinition } from "./invoke-types.js";
import { createClient, dependencyId, edgeKind, guardedMap } from "./dependency-clients.js";

export { DependencyAccessError, DependencyNotConfiguredError } from "./dependency-clients.js";

export const DEPENDENCY_CATEGORIES = ["jobs", "events", "buckets", "cache", "agents"] as const;
export type DependencyCategory = (typeof DEPENDENCY_CATEGORIES)[number];

export interface DependencyRefLike {
  readonly ref?: { readonly kind: string; readonly id: string };
  readonly kind?: string;
  readonly id?: string;
  readonly input?: StandardSchemaV1;
  readonly version?: number;
  readonly output?: StandardSchemaV1;
  readonly key?: StandardSchemaV1;
  readonly value?: StandardSchemaV1;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly profile?: string;
  readonly errors?: readonly InvocationErrorDefinition[];
  readonly dependencies?: DependencyDeclarations;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
}

export type DependencyDeclarations = Partial<{
  readonly [Category in Exclude<DependencyCategory, "events">]: Readonly<
    Record<string, DependencyRefLike>
  >;
}>;

/** Runtime provider/client values keyed by names declared on a function. */
export type DependencyClientSources = Partial<{
  readonly [Category in DependencyCategory]: Readonly<Record<string, unknown>>;
}>;

export type DependencyClientMaps = {
  readonly [Category in DependencyCategory]: Readonly<Record<string, unknown>>;
};

export interface DependencyBridgeOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface DependencyBridge {
  readonly run: <A>(
    operation: () => MaybePromise<A>,
    options?: DependencyBridgeOptions,
  ) => Promise<A>;
  readonly runVoid: (
    operation: () => MaybePromise<void>,
    options?: DependencyBridgeOptions,
  ) => Promise<void>;
}

export interface DirectFunctionRequest {
  readonly functionId: string;
  readonly name: string;
  readonly declaration: DependencyRefLike;
  readonly source: unknown;
  readonly input: unknown;
  readonly signal?: AbortSignal;
}

export type DirectFunctionInvoker = (request: DirectFunctionRequest) => MaybePromise<unknown>;

export interface DependencyClientBuildOptions {
  readonly ownerId: string;
  readonly dependencies?: DependencyDeclarations;
  readonly publications?: Readonly<Record<string, DependencyRefLike>>;
  readonly sources?: DependencyClientSources;
  readonly bridge?: DependencyBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: () => string | undefined;
  readonly causationInvocationId?: () => string | undefined;
  readonly traceId?: () => string | undefined;
  readonly now?: () => Date;
  readonly invokeFunction?: DirectFunctionInvoker;
  readonly onDeclaredEdge?: (edge: GraphEdge) => void;
  readonly onObservedEdge?: (edge: ObservedEdge) => void;
  readonly onOperation?: (
    operation: BucketOperationObservation | CacheOperationObservation,
  ) => void;
}

/** Builds frozen, declared-only client maps for one invocation. */
export function buildDependencyClients(
  options: DependencyClientBuildOptions,
): DependencyClientMaps {
  if (options.dependencies !== undefined && Object.hasOwn(options.dependencies, "events")) {
    throw new TypeError("Event dependencies are not supported; declare publishes instead");
  }
  return Object.freeze({
    jobs: buildCategory("jobs", options),
    events: buildCategory("events", options),
    buckets: buildCategory("buckets", options),
    cache: buildCategory("cache", options),
    agents: buildCategory("agents", options),
  });
}

function buildCategory(
  category: DependencyCategory,
  options: DependencyClientBuildOptions,
): Readonly<Record<string, unknown>> {
  const declarations =
    category === "events" ? (options.publications ?? {}) : (options.dependencies?.[category] ?? {});
  const sources = options.sources?.[category] ?? {};
  const clients: Record<string, unknown> = Object.create(null);
  for (const [name, declaration] of Object.entries(declarations)) {
    const targetId = dependencyId(category, name, declaration);
    notify(options.onDeclaredEdge, {
      kind: edgeKind(category),
      from: options.ownerId,
      to: targetId,
    } as GraphEdge);
    clients[name] = createClient(category, name, sources[name] ?? sources[targetId], options);
  }
  return guardedMap(category, clients);
}

function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(value);
  } catch {
    // Edge telemetry cannot replace the invocation or provider result.
  }
}
