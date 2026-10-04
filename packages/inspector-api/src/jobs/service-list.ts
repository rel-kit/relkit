import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { InspectorNativeJobs, inspectorNativeJobsExecution } from "./native.service.js";
import { authorizeJobs, bindingCapabilities, jobBindings } from "./services.js";
import { nativeAttempt, projectionAttempt } from "../native-edge.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";

/**
 * Lazily authorizes and projects ordered native service health.
 * @param generation - Active native job generation and configured concurrency.
 * @param request - Native request supplying privilege context.
 * @returns Redacted health evidence requiring InspectorNativeJobs.
 */
export const listJobServicesEffect = Effect.fn("InspectorJobs.listServices")(
  function* (generation: ResolvedActiveGeneration, request: Request) {
    yield* nativeAttempt(() => authorizeJobs(generation, request, "read"));
    const bindings = yield* nativeAttempt(() => jobBindings(generation));
    const native = yield* InspectorNativeJobs;
    const pages = yield* native.healthPages(bindings, generation.jobs?.maxReadConcurrency);
    return yield* projectionAttempt(() => {
      const items = pages.map(({ binding, health, available }) => {
        if (!available)
          return { ...bindingCapabilities(binding), health: { state: "unavailable" } } as JsonValue;
        const value = safeJson({ ...bindingCapabilities(binding), health });
        return isRecord(value)
          ? ({
              ...value,
              service: binding.service,
              serviceGeneration: binding.serviceGeneration,
            } as JsonValue)
          : value;
      });
      return safeJson({ ...identity(generation), items });
    });
  },
  (effect) => observeExecution("inspector", "jobs.list-services", effect),
);

/**
 * Lists native job services on the reused compatibility owner.
 * @param generation - Authorized native job generation.
 * @param request - Privilege and cancellation context.
 * @returns Ordered redacted service health.
 */
export function listJobServices(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorNativeJobsExecution,
    listJobServicesEffect(generation, request),
  );
}

/**
 * Lazily reads one service after privilege authorization.
 * @param generation - Native-job generation.
 * @param request - Native privilege context.
 * @param service - Service declaration identity.
 * @returns Explicit unavailable evidence or a redacted health envelope.
 */
export const getJobServiceEffect = Effect.fn("InspectorJobs.getService")(
  function* (generation: ResolvedActiveGeneration, request: Request, service: string) {
    yield* nativeAttempt(() => authorizeJobs(generation, request, "read", service));
    const bindings = yield* nativeAttempt(() => jobBindings(generation));
    const binding = bindings.find((value) => value.service === service);
    if (binding === undefined)
      return safeJson({ ...identity(generation), service, state: "unavailable" });
    const native = yield* InspectorNativeJobs;
    const pages = yield* native.healthPages([binding], 1);
    const page = pages[0]!;
    return yield* projectionAttempt(() => {
      if (!page.available)
        return {
          ...identity(generation),
          ...bindingCapabilities(binding),
          health: { state: "unavailable" },
        } as JsonValue;
      const value = safeJson({
        ...identity(generation),
        ...bindingCapabilities(binding),
        health: page.health,
      });
      return isRecord(value)
        ? ({
            ...value,
            service: binding.service,
            serviceGeneration: binding.serviceGeneration,
          } as JsonValue)
        : value;
    });
  },
  (effect) => observeExecution("inspector", "jobs.get-service", effect),
);

/**
 * Reads a native service through the compatibility owner.
 * @param generation - Authorized active generation.
 * @param request - Native privilege context.
 * @param service - Requested service identity.
 * @returns Redacted native health or explicit unavailability.
 */
export function getJobService(
  generation: ResolvedActiveGeneration,
  request: Request,
  service: string,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorNativeJobsExecution,
    getJobServiceEffect(generation, request, service),
  );
}
