import { createEventClient, type EventObservedEdge } from "../events/index.js";
import type { ObservedEdge } from "../graph/index.js";
import type { DependencyClientBuildOptions } from "./dependencies.js";
import { declaredDependencies } from "./dependency-identity.js";
import { redactNamedFields } from "../observability/redaction.js";

/** Bridge declared event publication with the active producer propagation context.
 * @returns A declared event publication client with invocation propagation.
 * @param name - Declared operation, dependency or field name.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param eventId - Canonical event identifier bound to the declared publication.
 */
export function createEventDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  eventId: string,
): unknown {
  const declaration = declaredDependencies("events", options)[name];
  return createEventClient({
    ownerId: options.ownerId,
    eventId,
    version: declaration?.version ?? 1,
    source,
    ...(declaration?.input === undefined ? {} : { payloadSchema: declaration.input }),
    ...(declaration?.profile === undefined ? {} : { profile: declaration.profile }),
    ...recordedPayloadOption(declaration),
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

/** The publication records the marker for the fields the event declares sensitive.
 * @param declaration - The declared event dependency, normally the event descriptor.
 * @returns The client's `recordedPayload` option, or nothing when no field is sensitive.
 * @example recordedPayloadOption({ sensitiveFields: ["cardNumber"] });
 */
export function recordedPayloadOption(declaration: unknown): {
  readonly recordedPayload?: (payload: unknown) => unknown;
} {
  const fields =
    declaration !== null && typeof declaration === "object"
      ? (declaration as { readonly sensitiveFields?: unknown }).sensitiveFields
      : undefined;
  if (!Array.isArray(fields) || fields.length === 0) return {};
  const names = fields.filter((field): field is string => typeof field === "string");
  return { recordedPayload: (payload: unknown) => redactNamedFields(payload, names) };
}
