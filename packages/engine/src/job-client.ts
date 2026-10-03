import type { ObservedEdge } from "@relkit/graph";
import { createJobClient, type JobObservedEdge } from "@relkit/jobs/legacy";
import type { DependencyClientBuildOptions } from "./dependencies.js";

/** Bridge a declared legacy job client while retaining propagation metadata.
 * @returns A legacy job client that propagates the active producer context.
 * @param name - Declared operation, dependency or field name.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param jobId - Canonical queue identifier bound to the declared legacy job dependency.
 */
export function createJobDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  jobId: string,
): unknown {
  const declaration = options.dependencies?.jobs?.[name];
  return createJobClient({
    ownerId: options.ownerId,
    jobId,
    source,
    ...(declaration?.input === undefined ? {} : { inputSchema: declaration.input }),
    ...(declaration?.profile === undefined ? {} : { profile: declaration.profile }),
    ...(options.bridge === undefined ? {} : { bridge: options.bridge }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.onObservedEdge === undefined
      ? {}
      : {
          onObservedEdge: (edge: JobObservedEdge) => options.onObservedEdge?.(edge as ObservedEdge),
        }),
    declared: true,
  });
}
