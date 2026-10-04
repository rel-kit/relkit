import type { Effect } from "effect";
import type { ObservabilityQueryRequest } from "@relkit/observability";
import type { InspectorObservationFailure } from "./native-edge.types.js";

/** Fixed observability collection labels; request IDs never become operation labels. */
export type InspectorObservabilityCollection = "requests" | "logs" | "traces";

/** Fixed observability detail labels. */
export type InspectorObservabilityDetail = "request" | "log" | "trace";

/** Native observation queries and response-owned live feeds under one live contract. */
export interface InspectorObservabilityService {
  readonly list: (
    kind: InspectorObservabilityCollection,
    query: ObservabilityQueryRequest,
  ) => Effect.Effect<unknown, InspectorObservationFailure>;
  readonly detail: (
    kind: InspectorObservabilityDetail,
    id: string,
  ) => Effect.Effect<unknown, InspectorObservationFailure>;
  readonly response: (
    request: Request,
    apiVersion: number,
  ) => Effect.Effect<Response, InspectorObservationFailure>;
}
