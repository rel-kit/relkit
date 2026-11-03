import type { Effect } from "effect";

/** Fixed operation labels for bounded OpenAPI telemetry attributes.
 * @example const operation: OpenApiOperationName = "generate";
 */
export type OpenApiOperationName =
  | "generate"
  | "serialize"
  | "request"
  | "responses"
  | "services.index"
  | "services.resolve"
  | "tags.service"
  | "tags.operation"
  | "tags.document"
  | "operation"
  | "path";

/** Injectable observer for testing and replacing package telemetry.
 * @example const observer: OpenApiTelemetryService = { observe: (_name, effect) => effect };
 */
export interface OpenApiTelemetryService {
  /** Observe one operation without changing its success, error, or requirements.
   * @param operation - Fixed operation label.
   * @param effect - Effect to observe.
   * @returns The same Effect channels with observation attached.
   * @example observer.observe("generate", Effect.succeed(document));
   */
  readonly observe: <A, E, R>(
    operation: OpenApiOperationName,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
