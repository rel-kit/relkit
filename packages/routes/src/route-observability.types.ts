import type { Effect } from "effect";

/** Bounded name for a route authoring operation.
 * @example const operation: RouteOperation = "route.define";
 */
export type RouteOperation =
  | "middleware.define"
  | "middleware.is-descriptor"
  | "middleware.is-path"
  | "route.define"
  | "service-routes.define"
  | "auth.read-registration"
  | "auth.copy-protected"
  | "client.copy"
  | "stream.copy"
  | "options.copy-rate-limit"
  | "options.positive"
  | "options.success-status"
  | "dsl.define-transform"
  | "dsl.is-transform-ref"
  | "dsl.input"
  | "dsl.nested"
  | "dsl.source"
  | "dsl.whole-body"
  | "dsl.constant"
  | "dsl.optional"
  | "dsl.default"
  | "dsl.transform"
  | "dsl.response"
  | "dsl.continue"
  | "dsl.respond"
  | "validation.is-mapping"
  | "validation.assert-mapping"
  | "validation.is-request"
  | "validation.assert-request"
  | "validation.is-response"
  | "validation.assert-response"
  | "validation.is-decision"
  | "validation.is-schema"
  | "validation.assert-schema"
  | "validation.is-status"
  | "validation.is-record";

/** Replaceable observer for route operations.
 * @example const telemetry: RouteTelemetryService = { observe: (_operation, effect) => effect };
 */
export interface RouteTelemetryService {
  /**
   * Measures an operation without changing its success or failure channel.
   * @param operation - Fixed route operation name.
   * @param effect - Work to observe.
   * @returns The observed Effect with unchanged channels.
   * @example telemetry.observe("route.define", Effect.succeed(route));
   */
  readonly observe: <A, E, R>(
    operation: RouteOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
