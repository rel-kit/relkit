import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import { PROTOCOL_VERSION, type JsonValue } from "@relkit/contracts";
import { identity, isRecord, resolveService, type ResolvedActiveGeneration } from "./shared.js";

export const INSPECTOR_EVENTS_PROTOCOL = "relkit.events.admin" as const;
export const INSPECTOR_EVENTS_VERSION = PROTOCOL_VERSION;

/**
 * Resolves the native events query and projects its declared runtime evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing bounded public events contracts, triggers, publications and deliveries.
 */
export const eventRuntimeListEffect = Effect.fn("Inspector.eventRuntimeList")(
  function* (generation: ResolvedActiveGeneration, request: Request) {
    const source = yield* nativeAttempt(() => resolveService(generation.runtime?.events));
    const query = isRecord(source) ? source.query : undefined;
    const result =
      typeof query === "function"
        ? yield* nativeAttempt(() => query.call(source, eventQuery(request)))
        : source;
    return yield* projectionAttempt(
      () => ({ ...identity(generation), ...projectQuery(result, request) }) as JsonValue,
    );
  },
  (effect) => observeExecution("inspector", "eventRuntimeList", effect),
);

/**
 * Resolves the native events query and projects its declared runtime evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Bounded public events contracts, triggers, publications and deliveries.
 */
export function eventRuntimeList(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, eventRuntimeListEffect(generation, request));
}

import { eventQuery, projectQuery } from "./events-query.js";
