import type { MaybePromise } from "../contracts/index.js";
import type { ObservedEdge } from "../graph/index.js";
import type {
  DependencyBridgeOptions,
  DependencyCategory,
  DependencyClientBuildOptions,
} from "./dependencies.types.js";
import { notify } from "./edge-hooks.js";
import { dependencyIdFromClient, edgeKinds } from "./dependency-identity.js";

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
