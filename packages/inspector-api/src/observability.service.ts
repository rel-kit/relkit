import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type {
  ObservabilityQuery,
  ObservabilityQueryRequest,
  ObservabilityStream,
} from "@relkit/observability";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import type { InspectorObservationFailure } from "./native-edge.types.js";
import { streamResponse } from "./observability-stream.js";
import { InspectorEndpointError } from "./router-utils.js";
import type {
  InspectorObservabilityCollection,
  InspectorObservabilityDetail,
  InspectorObservabilityService,
} from "./observability-service.types.js";

/** Native observation queries and live SSE acquisition, protected by the router edge. */
export class InspectorObservability extends Context.Service<
  InspectorObservability,
  InspectorObservabilityService
>()("@relkit/inspector/Observability") {}

/**
 * Retains observation authorities once for an installing router.
 * @param query - Native bounded query authority; operation logs never publish into it.
 * @param stream - Native replay stream; each response acquires its own scope.
 * @returns A live observation layer with unchanged native failure identities.
 * @remarks Its finite methods can be replaced with Layer.succeed and Service.of
 * in tests. The response owns cleanup, so body cancellation does not retire this layer.
 * @example
 * ```ts
 * import { Effect, ManagedRuntime } from "effect";
 * import { createObservabilityStream } from "@relkit/observability";
 * import { InspectorObservability, inspectorObservabilityLayer } from "@relkit/inspector-api";
 * const source = createObservabilityStream();
 * const owner = ManagedRuntime.make(inspectorObservabilityLayer(undefined, source));
 * try {
 *   const response = await owner.runPromise(Effect.flatMap(InspectorObservability,
 *     (observation) => observation.response(new Request("http://localhost"), 1)));
 *   await response.body!.cancel();
 * } finally { source.close(); await owner.dispose(); }
 * ```
 */
export function inspectorObservabilityLayer(
  query: ObservabilityQuery | undefined,
  stream: ObservabilityStream | undefined,
) {
  return Layer.effect(
    InspectorObservability,
    Effect.sync(() => {
      const list = Effect.fn("InspectorObservability.list")(
        (
          kind: InspectorObservabilityCollection,
          request: ObservabilityQueryRequest,
        ): Effect.Effect<unknown, InspectorObservationFailure> =>
          query === undefined
            ? Effect.fail(new InspectorEndpointError("RELKIT_OBSERVABILITY_UNAVAILABLE", 503))
            : nativeAttempt<unknown>(() => query[kind](request)),
        (effect) =>
          observeExecution("inspector", "observability.list", effect, () => ({ queries: 1 })),
      );
      const detail = Effect.fn("InspectorObservability.detail")(
        (
          kind: InspectorObservabilityDetail,
          id: string,
        ): Effect.Effect<unknown, InspectorObservationFailure> =>
          query === undefined
            ? Effect.fail(new InspectorEndpointError("RELKIT_OBSERVABILITY_UNAVAILABLE", 503))
            : nativeAttempt<unknown>(() => query[kind](id)),
        (effect) =>
          observeExecution("inspector", "observability.detail", effect, () => ({ queries: 1 })),
      );
      const response = Effect.fn("InspectorObservability.response")(
        (
          request: Request,
          apiVersion: number,
        ): Effect.Effect<Response, InspectorObservationFailure> =>
          stream === undefined
            ? Effect.fail(new InspectorEndpointError("RELKIT_OBSERVABILITY_UNAVAILABLE", 503))
            : Effect.contextWith((context: Context.Context<never>) =>
                projectionAttempt(() =>
                  streamResponse(stream, request, apiVersion, 5_000, context),
                ),
              ),
        (effect) =>
          observeExecution("inspector", "observability.open", effect, () => ({ responses: 1 })),
      );
      return InspectorObservability.of({ list, detail, response });
    }),
  );
}
