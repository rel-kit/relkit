import { createEventClient, type EventObservedEdge } from "@relkit/events";
import type { ObservedEdge } from "@relkit/graph";
import type { DependencyClientBuildOptions } from "./dependencies.js";

export function createEventDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  eventId: string,
): unknown {
  const declaration = options.publications?.[name];
  return createEventClient({
    ownerId: options.ownerId,
    eventId,
    version: declaration?.version ?? 1,
    source,
    ...(declaration?.input === undefined ? {} : { payloadSchema: declaration.input }),
    ...(declaration?.profile === undefined ? {} : { profile: declaration.profile }),
    ...(options.bridge === undefined ? {} : { bridge: options.bridge }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.onObservedEdge === undefined
      ? {}
      : {
          onObservedEdge: (edge: EventObservedEdge) =>
            options.onObservedEdge?.(edge as ObservedEdge),
        }),
    declared: true,
  });
}
