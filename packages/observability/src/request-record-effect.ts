import { Clock, Effect, Schema } from "effect";
import type { RequestOutcome, RequestRecord } from "./model.js";
import type {
  RequestDetailInput,
  RequestFinishOptions,
  RequestRecordBuilderEffects,
  RequestRecordBuilderOptions,
} from "./request-record.types.js";
import { observeRequestRecord as observe } from "./request-record-metrics.js";
/**
 * Reports a timestamp that cannot be represented as a JavaScript date.
 *
 * @example
 * if (error._tag === "RequestRecordError") console.error(error.field);
 */
export class RequestRecordError extends Schema.TaggedError<RequestRecordError>()(
  "RequestRecordError",
  { field: Schema.Literals(["startedAt", "completedAt"]), message: Schema.String },
) {}
/**
 * Creates one request lifecycle whose state changes are Effect operations.
 * The built-in Clock is substitutable in tests; `options.now` preserves the
 * existing compatibility API.
 *
 * @param options - Request identity, sizes, and optional compatibility clock.
 * @returns An Effect with a builder or tagged invalid-start-time error. Its
 * `finish` method can return a tagged invalid-completion-time error.
 * @example
 * const builder = Effect.runSync(makeRequestRecordBuilderEffect(options));
 * const completed = Effect.runSync(builder.finish({ status: 200 }));
 */
export const makeRequestRecordBuilderEffect = Effect.fn("ObservabilityRequestRecord.create")(
  function* (options: RequestRecordBuilderOptions) {
    const compatibilityClock = options.now;
    const now =
      compatibilityClock === undefined
        ? () => Clock.currentTimeMillis
        : () => Effect.sync(compatibilityClock);
    const startedAt = options.startedAt ?? (yield* now());
    if (!validTime(startedAt))
      return yield* Effect.fail(
        new RequestRecordError({
          field: "startedAt",
          message: "Invalid time value",
        }),
      );
    let traceId = options.traceId;
    let routeId = "unknown";
    let functionId = "unknown";
    let serviceId = options.serviceId;
    let invocationId = `request:${options.requestId}`;
    let requestOutcome: RequestOutcome = "success";
    let errorId: string | undefined;
    let finished: RequestRecord | undefined;
    const started = Object.freeze({
      version: 2,
      signal: "request",
      phase: "started",
      requestId: options.requestId,
      originRequestId: options.requestId,
      traceId,
      generationId: options.generationId,
      graphHash: options.graphHash,
      startedAt: new Date(startedAt).toISOString(),
      method: options.method,
      rawPath: options.rawPath,
      ...(serviceId === undefined ? {} : { serviceId }),
      ...(validBytes(options.requestBytes) ? { requestBytes: options.requestBytes } : {}),
    } as const satisfies RequestRecord);
    const add = Effect.fn("ObservabilityRequestRecord.add")(
      (detail: RequestDetailInput) =>
        Effect.sync(() => {
          if (finished === undefined) void detail;
        }),
      (effect) => observe("add", effect),
    );
    const setTraceId = Effect.fn("ObservabilityRequestRecord.setTraceId")(
      (value: string) =>
        Effect.sync(() => {
          if (finished === undefined && text(value) !== undefined) traceId = value;
        }),
      (effect) => observe("setTraceId", effect),
    );
    const setRoute = Effect.fn("ObservabilityRequestRecord.setRoute")(
      (nextRouteId: string, nextFunctionId: string) =>
        Effect.sync(() => {
          if (finished !== undefined) return;
          if (text(nextRouteId) !== undefined) routeId = nextRouteId;
          if (text(nextFunctionId) !== undefined) functionId = nextFunctionId;
        }),
      (effect) => observe("setRoute", effect),
    );
    const setServiceId = Effect.fn("ObservabilityRequestRecord.setServiceId")(
      (value: string | undefined) =>
        Effect.sync(() => {
          if (finished === undefined && text(value) !== undefined) serviceId = value;
        }),
      (effect) => observe("setServiceId", effect),
    );
    const setInvocationId = Effect.fn("ObservabilityRequestRecord.setInvocationId")(
      (value: string) =>
        Effect.sync(() => {
          if (finished === undefined && text(value) !== undefined) invocationId = value;
        }),
      (effect) => observe("setInvocationId", effect),
    );
    const setOutcome = Effect.fn("ObservabilityRequestRecord.setOutcome")(
      (outcome: RequestOutcome, nextErrorId?: string) =>
        Effect.sync(() => {
          if (finished !== undefined) return requestOutcome;
          if (requestOutcome === "success" || outcome !== "success") requestOutcome = outcome;
          if (text(nextErrorId) !== undefined) errorId = nextErrorId;
          return requestOutcome;
        }),
      (effect) => observe("setOutcome", effect),
    );
    const finish = Effect.fn("ObservabilityRequestRecord.finish")(
      function* (finishOptions: RequestFinishOptions) {
        if (finished !== undefined) return finished;
        const completedAt = finishOptions.completedAt ?? (yield* now());
        if (!validTime(completedAt))
          return yield* Effect.fail(
            new RequestRecordError({
              field: "completedAt",
              message: "Invalid time value",
            }),
          );
        finished = Object.freeze({
          version: 2,
          signal: "request",
          phase: "completed",
          requestId: options.requestId,
          originRequestId: options.requestId,
          traceId,
          generationId: options.generationId,
          graphHash: options.graphHash,
          invocationId,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date(completedAt).toISOString(),
          durationMs: Math.max(0, completedAt - startedAt),
          method: options.method,
          rawPath: options.rawPath,
          normalizedRoute: routeId,
          routeId,
          functionId,
          ...(serviceId === undefined ? {} : { serviceId }),
          status: validStatus(finishOptions.status) ? finishOptions.status : 500,
          ...(validBytes(options.requestBytes) ? { requestBytes: options.requestBytes } : {}),
          ...(validBytes(finishOptions.responseBytes)
            ? { responseBytes: finishOptions.responseBytes }
            : {}),
          outcome: requestOutcome,
          ...(errorId === undefined ? {} : { errorId }),
        });
        return finished;
      },
      (effect) => observe("finish", effect),
    );
    const builder: RequestRecordBuilderEffects = {
      started,
      add,
      setTraceId,
      setRoute,
      setServiceId,
      setInvocationId,
      setOutcome,
      finish,
    };
    return builder;
  },
  (effect) => observe("create", effect),
);
function text(value: string | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function validBytes(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}
function validStatus(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 100 && value <= 599;
}
function validTime(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000_000;
}
