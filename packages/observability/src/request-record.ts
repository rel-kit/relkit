import { Effect } from "effect";
import { makeRequestRecordBuilderEffect } from "./request-record-effect.js";
import type { RequestRecordError } from "./request-record-effect.js";
import type { RequestRecordBuilder, RequestRecordBuilderOptions } from "./request-record.types.js";
export { makeRequestRecordBuilderEffect } from "./request-record-effect.js";
export { RequestRecordError } from "./request-record-effect.js";
export type {
  RequestDetailInput,
  RequestFinishOptions,
  RequestRecordBuilder,
  RequestRecordBuilderEffects,
  RequestRecordBuilderOptions,
  RequestRecordSink,
} from "./request-record.types.js";
/**
 * Builds one immutable request record while keeping body values outside telemetry.
 * Every synchronous method delegates to its Effect implementation.
 *
 * @param options - Request identity, input size, and optional clock.
 * @returns A builder with a stable started record and one final result.
 * @throws {RangeError} If a start or completion timestamp cannot form a date.
 * @example
 * const builder = createRequestRecordBuilder(options);
 * const completed = builder.finish({ status: 200 });
 */
export function createRequestRecordBuilder(
  options: RequestRecordBuilderOptions,
): RequestRecordBuilder {
  const run = <A>(effect: Effect.Effect<A, RequestRecordError>): A =>
    Effect.runSync(
      effect.pipe(
        Effect.catchTag("RequestRecordError", (error) =>
          Effect.sync(() => {
            throw new RangeError(error.message);
          }),
        ),
      ),
    );
  const builder = run(makeRequestRecordBuilderEffect(options));
  return Object.freeze({
    started: builder.started,
    add: (detail) => run(builder.add(detail)),
    setTraceId: (traceId) => run(builder.setTraceId(traceId)),
    setRoute: (routeId, functionId) => run(builder.setRoute(routeId, functionId)),
    setServiceId: (serviceId) => run(builder.setServiceId(serviceId)),
    setInvocationId: (invocationId) => run(builder.setInvocationId(invocationId)),
    setOutcome: (outcome, errorId) => run(builder.setOutcome(outcome, errorId)),
    finish: (finishOptions) => run(builder.finish(finishOptions)),
  } satisfies RequestRecordBuilder);
}
