import { createBucketClient } from "../buckets/index.js";
import type { MaybePromise } from "../contracts/index.js";
import type { GraphEdge, ObservedEdge } from "../graph/index.js";
import { createCacheDependencyClient } from "./cache-client.js";
import type {
  DependencyBridgeOptions,
  DependencyCategory,
  DependencyClientBuildOptions,
  DependencyRefLike,
} from "./dependencies.js";
import { notify } from "./edge-hooks.js";
import {
  createChannelDependencyClient,
  createDatabaseDependencyClient,
  createFunctionDependencyClient,
} from "./dependency-call-clients.js";
import { dependencyId, dependencyIdFromClient, edgeKinds } from "./dependency-identity.js";
import { createEventDependencyClient } from "./event-client.js";
import { createJobDependencyClient } from "./job-client.js";
import { createTaskDependencyClient } from "./task-client.js";
export { guardedMap } from "./dependency-clients-guard.js";
export { runDependency } from "./dependency-run.js";
import { runDependency } from "./dependency-run.js";
export {
  declaredDependencies,
  dependencyId,
  dependencyIdFromClient,
  edgeKind,
} from "./dependency-identity.js";

export { DependencyAccessError, DependencyNotConfiguredError } from "./dependency-errors.js";
import { DependencyNotConfiguredError } from "./dependency-errors.js";

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
  const id = dependencyIdFromClient(options, category, name);
  switch (category) {
    case "functions":
      return createFunctionDependencyClient(name, source, options, id);
    case "channels":
      return createChannelDependencyClient(name, source, options);
    case "databases":
      return createDatabaseDependencyClient(name, source);
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
