import { createJobClient, type JobObservedEdge } from "@zsys/jobs";
import type { ObservedEdge } from "@zsys/graph";
import type { DependencyClientBuildOptions } from "./dependencies.js";

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
