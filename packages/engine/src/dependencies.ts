import type { GraphEdge } from "@relkit/graph";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import type {
  DependencyCategory,
  DependencyClientBuildOptions,
  DependencyClientMaps,
} from "./dependencies.types.js";
import { createClient, dependencyId, edgeKind, guardedMap } from "./dependency-clients.js";
import { runEngineSync } from "./engine-runtime.js";
export type {
  DependencyBridge,
  DependencyBridgeOptions,
  DependencyCategory,
  DependencyClientBuildOptions,
  DependencyClientMaps,
  DependencyClientSources,
  DependencyDeclarations,
  DependencyRefLike,
  DirectFunctionInvoker,
  DirectFunctionRequest,
  DirectTaskInvoker,
  DirectTaskRequest,
} from "./dependencies.types.js";

export { DependencyAccessError, DependencyNotConfiguredError } from "./dependency-clients.js";

/** Client families exposed by guarded invocation contexts. */
export const DEPENDENCY_CATEGORIES = [
  "tasks",
  "jobs",
  "events",
  "buckets",
  "cache",
  "agents",
] as const;

/** Builds frozen, declared-only client maps for one invocation.
 * @returns Frozen maps exposing only declared clients and publications.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function buildDependencyClients(
  options: DependencyClientBuildOptions,
): DependencyClientMaps {
  return runEngineSync(buildDependencyClientsEffect(options));
}

/** Compose buildDependencyClients with the caller's Effect diagnostics and dependencies.
 * @param options - Explicit operation configuration.
 * @returns A lazy Effect yielding guarded client maps; unsupported event dependencies fail with TypeError.
 */
export const buildDependencyClientsEffect = Effect.fn("Engine.buildDependencyClients")(
  (options: DependencyClientBuildOptions) =>
    observeExecution(
      "engine",
      "buildDependencyClients",
      Effect.gen(function* () {
        if (options.dependencies !== undefined && Object.hasOwn(options.dependencies, "events")) {
          return yield* Effect.fail(
            new TypeError("Event dependencies are not supported; declare publishes instead"),
          );
        }
        return Object.freeze({
          tasks: buildCategory("tasks", options),
          jobs: buildCategory("jobs", options),
          events: buildCategory("events", options),
          buckets: buildCategory("buckets", options),
          cache: buildCategory("cache", options),
          agents: buildCategory("agents", options),
        });
      }),
    ),
);

/** Build one declared client map with identity-bound sources and edge observations.
 * @returns A frozen client map denying undeclared names.
 * @param category - Declared client capability family.
 * @param options - Explicit configuration and dependencies for this operation.
 */
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
    const source = Object.hasOwn(sources, targetId) ? sources[targetId] : sources[name];
    clients[name] = createClient(category, name, source, options);
  }
  return guardedMap(category, clients);
}

/** Deliver advisory edge telemetry without replacing the authoritative result.
 * @typeParam T - Observed callback value.
 * @returns Nothing; failures from advisory callbacks are isolated.
 * @param hook - Optional advisory callback; observer failures cannot change execution.
 * @param value - Native value being validated or projected.
 */
function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(value);
  } catch {
    // Edge telemetry cannot replace the invocation or provider result.
  }
}
