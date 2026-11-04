import type { GraphEdge } from "../graph/index.js";
import { getDescriptorIdentity, isDescriptorIdentityBound } from "../invocation/index.js";
import type {
  DependencyCategory,
  DependencyClientBuildOptions,
  DependencyRefLike,
} from "./dependencies.types.js";

/** Declared graph edge for each client family. */
export const edgeKinds: Readonly<Record<DependencyCategory, GraphEdge["kind"]>> = {
  functions: "calls-function",
  tasks: "triggers-task",
  jobs: "enqueues-job",
  events: "publishes-event",
  channels: "triggers-channel",
  databases: "uses-database",
  buckets: "uses-bucket",
  cache: "uses-cache",
  agents: "invokes-agent",
};

const refKinds: Readonly<Record<DependencyCategory, string>> = {
  functions: "function",
  tasks: "task",
  jobs: "job",
  events: "event",
  channels: "channel",
  databases: "service",
  buckets: "bucket",
  cache: "cache",
  agents: "agent",
};

/** Map a client family to the corresponding declared graph edge.
 * @returns The corresponding declared graph relationship.
 * @param category - Declared client capability family.
 */
export function edgeKind(category: DependencyCategory): GraphEdge["kind"] {
  return edgeKinds[category];
}

/** Collect the declarations of one client family; events also include ID-keyed publications.
 * @returns Declarations keyed by the name the handler uses.
 * @param category - Declared client capability family.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function declaredDependencies(
  category: DependencyCategory,
  options: DependencyClientBuildOptions,
): Readonly<Record<string, DependencyRefLike>> {
  const declared = options.dependencies?.[category] ?? {};
  return category === "events" ? { ...options.publications, ...declared } : declared;
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
  const id =
    value.ref === undefined || isDescriptorIdentityBound(value)
      ? getDescriptorIdentity(value)
      : reference.id;
  if (reference.kind !== refKinds[category] || typeof id !== "string" || id.length === 0) {
    throw new TypeError(`Invalid ${category} dependency "${name}"`);
  }
  return id;
}

/** Resolve the declared identity used for dependency tracing.
 * @returns The declared stable dependency identity.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 */
export function dependencyIdFromClient(
  options: DependencyClientBuildOptions,
  category: DependencyCategory,
  name: string,
): string {
  const declaration = declaredDependencies(category, options)[name];
  return declaration === undefined ? name : dependencyId(category, name, declaration);
}
