import { createBucketClient } from "@relkit/buckets";
import type { MaybePromise } from "@relkit/contracts";
import type { GraphEdge, ObservedEdge } from "@relkit/graph";
import { getDescriptorIdentity } from "@relkit/invocation";
import { createCacheDependencyClient } from "./cache-client.js";
import type {
  DependencyBridgeOptions,
  DependencyCategory,
  DependencyClientBuildOptions,
  DependencyRefLike,
} from "./dependencies.js";
import { notify } from "./edge-hooks.js";
import { createEventDependencyClient } from "./event-client.js";
import { createJobDependencyClient } from "./job-client.js";
import { createTaskDependencyClient } from "./task-client.js";
export { guardedMap } from "./dependency-clients-guard.js";

/** Compatibility error raised when a handler accesses an undeclared client. */
export class DependencyAccessError extends TypeError {
  readonly category: DependencyCategory;
  readonly dependencyName: string;
  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param category - Declared client capability family.
   * @param name - Declared operation, dependency or field name.
   * @returns undefined
   */
  constructor(category: DependencyCategory, name: string) {
    super(`Dependency "${category}.${name}" is not declared on this function`);
    this.name = "DependencyAccessError";
    this.category = category;
    this.dependencyName = name;
  }
}

/** Compatibility error raised when a declared client has no runtime source. */
export class DependencyNotConfiguredError extends Error {
  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param category - Declared client capability family.
   * @param name - Declared operation, dependency or field name.
   * @returns undefined
   */
  constructor(category: DependencyCategory, name: string) {
    super(`Dependency "${category}.${name}" has no active client`);
    this.name = "DependencyNotConfiguredError";
  }
}

const edgeKinds: Readonly<Record<DependencyCategory, GraphEdge["kind"]>> = {
  tasks: "triggers-task",
  jobs: "enqueues-job",
  events: "publishes-event",
  buckets: "uses-bucket",
  cache: "uses-cache",
  agents: "invokes-agent",
};

const refKinds: Readonly<Record<DependencyCategory, string>> = {
  tasks: "task",
  jobs: "job",
  events: "event",
  buckets: "bucket",
  cache: "cache",
  agents: "agent",
};

/** Map a client family to the corresponding declared graph edge.
 * @returns The corresponding declared graph relationship.
 * @param category - Declared client capability family.
 */
export function edgeKind(category: DependencyCategory): GraphEdge["kind"] {
  return edgeKinds[category] as GraphEdge["kind"];
}

/** Resolve authored or manifest-bound dependency identity.
 * @returns The manifest-bound or authored stable dependency identity.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 * @param value - Native value being validated or projected.
 */
export function dependencyId(
  category: DependencyCategory,
  name: string,
  value: DependencyRefLike,
): string {
  const reference = value.ref ?? value;
  const id = value.ref === undefined ? getDescriptorIdentity(value) : reference.id;
  if (reference.kind !== refKinds[category] || typeof id !== "string" || id.length === 0) {
    throw new TypeError(`Invalid ${category} dependency "${name}"`);
  }
  return id;
}

/** Select the native dependency adapter for a declared client family.
 * @returns A guarded native adapter for the declared capability family.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createClient(
  category: DependencyCategory,
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
): unknown {
  switch (category) {
    case "tasks":
      return createTaskDependencyClient(
        name,
        source,
        options,
        dependencyIdFromClient(options, category, name),
      );
    case "agents":
      return wrapCallable(category, name, source, options);
    case "jobs":
      return createJobDependencyClient(
        name,
        source,
        options,
        dependencyIdFromClient(options, category, name),
      );
    case "events":
      return createEventDependencyClient(
        name,
        source,
        options,
        dependencyIdFromClient(options, category, name),
      );
    case "buckets":
      return createBucketClient({
        ownerId: options.ownerId,
        bucketId: dependencyIdFromClient(options, category, name),
        source,
        ...(options.bridge === undefined ? {} : { bridge: options.bridge }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
        ...(options.onObservedEdge === undefined ? {} : { onObservedEdge: options.onObservedEdge }),
        ...(options.onOperation === undefined ? {} : { onOperation: options.onOperation }),
      });
    case "cache":
      return createCacheDependencyClient(
        name,
        dependencyIdFromClient(options, category, name),
        source,
        options,
      );
  }
}

/** Wrap an agent/function dependency in the invocation bridge.
 * @returns A callable dependency returning the bridged native Promise.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 */
function wrapCallable(
  category: "agents",
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
): (input: unknown) => Promise<unknown> {
  if (
    source !== undefined &&
    typeof source !== "function" &&
    options.invokeFunction === undefined
  ) {
    throw new TypeError(`Invalid ${category} client "${name}"`);
  }
  return (input) => {
    if (options.invokeFunction !== undefined) {
      notify(options.onObservedEdge, {
        relationship: edgeKinds[category],
        from: options.ownerId,
        to: dependencyIdFromClient(options, category, name),
      });
      const declaration = options.dependencies?.[category]?.[name];
      if (declaration === undefined) throw new DependencyNotConfiguredError(category, name);
      const dependency = dependencyId(category, name, declaration);
      return Promise.resolve(
        options.invokeFunction({
          functionId: category === "agents" ? `relkit.agent.${dependency}.invoke` : dependency,
          name,
          declaration,
          source,
          input,
          ...(options.signal === undefined ? {} : { signal: options.signal() }),
        }),
      );
    }
    return runDependency(options, category, name, "call", () => {
      if (source === undefined) throw new DependencyNotConfiguredError(category, name);
      return (source as (value: unknown) => MaybePromise<unknown>)(input);
    });
  };
}

/** Evaluate a native dependency call with operation metadata and cancellation.
 * @typeParam A - Successful operation result.
 * @returns A Promise of the original native capability result.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 * @param operation - Declared method name included in dependency span metadata.
 * @param work - Lazy native callback invoked with its original receiver and arguments.
 */
export function runDependency<A>(
  options: DependencyClientBuildOptions,
  category: DependencyCategory,
  name: string,
  operation: string,
  work: () => MaybePromise<A>,
): Promise<A> {
  notify(options.onObservedEdge, {
    relationship: edgeKinds[category] as ObservedEdge["relationship"],
    from: options.ownerId,
    to: dependencyIdFromClient(options, category, name),
  });
  const bridgeOptions: DependencyBridgeOptions = {
    name: `relkit.dependency.${category}.${name}.${operation}`,
    attributes: { "relkit.dependency.category": category, "relkit.dependency.name": name },
  };
  return options.bridge === undefined
    ? Promise.resolve().then(work)
    : options.bridge.run(work, bridgeOptions);
}

/** Resolve the declared identity used for dependency tracing.
 * @returns The declared stable dependency identity.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 */
function dependencyIdFromClient(
  options: DependencyClientBuildOptions,
  category: DependencyCategory,
  name: string,
): string {
  const declaration =
    category === "events" ? options.publications?.[name] : options.dependencies?.[category]?.[name];
  return declaration === undefined ? name : dependencyId(category, name, declaration);
}
