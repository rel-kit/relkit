import { isSpanId, isTraceId, type ProtocolId } from "../contracts/index.js";
import {
  currentExecutionContext,
  runInExecutionContext,
  SpanRuntime,
  type InvocationFailure,
} from "../invocation/index.js";
import { Context, Exit, Option, Tracer } from "effect";
import { createInvocationSpanOptions } from "./invoke-tracing.js";
import { recordedInput } from "./recorded-input.js";
import type {
  InvocationIdSource,
  InvocationRecord,
  InvocationTarget,
  InvocationValidationError,
  InvokeOptions,
} from "./invoke-types.js";

/** Create shared span ownership for a complete invocation or deferred stream.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Ctx - Handler context carrying cancellation authority.
 * @returns The shared span and completion/capture methods for this invocation.
 * @param target - Declared target whose schema and metadata govern execution.
 * @param record - Immutable invocation identity and start metadata.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param controller - Invocation-owned abort controller.
 * @param ids - Generation identifier source used for new invocation spans.
 */
export function createInvocationExecution<
  Input,
  Output,
  Ctx extends { readonly signal: AbortSignal },
>(
  target: InvocationTarget<Input, Output, Ctx>,
  record: InvocationRecord,
  options: InvokeOptions<Input, Output, Ctx>,
  controller: AbortController,
  ids: InvocationIdSource,
) {
  const active = currentExecutionContext();
  const spanOptions = createInvocationSpanOptions(target, record, options, controller);
  const runtime =
    active?.runtime ??
    new SpanRuntime({
      ids: {
        next: (kind) => (kind === "trace" ? (record.traceId as ProtocolId) : ids.next("span")),
      },
      ...(spanOptions.observer === undefined ? {} : { observer: spanOptions.observer }),
      ...(options.hooks?.observability?.capture === undefined
        ? {}
        : { capture: options.hooks.observability.capture }),
      recording: spanOptions.observer !== undefined,
    });
  const explicit =
    options.parent?.spanId &&
    isSpanId(options.parent.spanId) &&
    options.parent.traceId === record.traceId
      ? Tracer.externalSpan({
          traceId: record.traceId,
          spanId: options.parent.spanId,
          sampled: true,
        })
      : undefined;
  const parent = explicit ?? (active?.span.traceId === record.traceId ? active.span : undefined);
  const links = (options.links ?? [])
    .filter((link) => isTraceId(link.traceId) && isSpanId(link.spanId))
    .map((link) => ({
      span: Tracer.externalSpan({
        traceId: link.traceId,
        spanId: link.spanId,
        sampled: (link.traceFlags & 1) === 1,
      }),
      attributes: {},
    }));
  // Shared span timestamps are epoch nanoseconds for trace compatibility. Engine
  // operation durations use the configured monotonic Effect Clock separately.
  const common = {
    name: spanOptions.name,
    parent: parent ? Option.some(parent) : Option.none(),
    annotations: Context.empty(),
    links,
    startTime: BigInt(Date.now()) * 1_000_000n,
    kind:
      parent === undefined &&
      (record.source === "job" ||
        record.source === "event-delivery" ||
        record.source === "event-replay")
        ? ("consumer" as const)
        : ("internal" as const),
    root: parent === undefined,
    sampled: true,
  };
  const attributes = {
    "relkit.invocation.id": record.id,
    "relkit.function.id": target.id,
    "relkit.invocation.source": record.source,
    ...(record.parentId === undefined ? {} : { "relkit.invocation.parent_id": record.parentId }),
    ...(record.serviceId === undefined ? {} : { "relkit.service.id": record.serviceId }),
    ...(record.correlationId === undefined
      ? {}
      : { "relkit.correlation.id": record.correlationId }),
    ...(record.runId === undefined ? {} : { "relkit.run.id": record.runId }),
    ...(record.jobId === undefined ? {} : { "relkit.job.id": record.jobId }),
    ...(record.taskId === undefined ? {} : { "relkit.task.id": record.taskId }),
    ...(record.taskVersion === undefined ? {} : { "relkit.task.version": record.taskVersion }),
    ...(record.buildId === undefined ? {} : { "relkit.build.id": record.buildId }),
    ...(record.serviceGeneration === undefined
      ? {}
      : { "relkit.service.generation": record.serviceGeneration }),
    "relkit.attempt": record.attempt,
    ...(options.requestId === undefined && active?.requestId === undefined
      ? {}
      : { "relkit.request.id": options.requestId ?? active!.requestId! }),
    ...(options.originRequestId === undefined && active?.originRequestId === undefined
      ? {}
      : { "relkit.origin_request.id": options.originRequestId ?? active!.originRequestId! }),
  };
  const span =
    parent === undefined
      ? runtime.startRoot(common, record.traceId, attributes)
      : runtime.start(common, attributes);
  const context = {
    ...active,
    span,
    runtime,
    invocationId: record.id,
    ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    ...(options.originRequestId === undefined ? {} : { originRequestId: options.originRequestId }),
    ...(record.parentId === undefined ? {} : { parentInvocationId: record.parentId }),
    functionId: target.id,
    ...(record.serviceId === undefined ? {} : { serviceId: record.serviceId }),
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
  };
  return Object.freeze({
    span,
    run: <A>(callback: () => A): A => runInExecutionContext(context, callback),
    captureInput: (value: unknown): void => span.capture("input", recordedInput(target, value)),
    captureOutput: (value: unknown): void => span.capture("output", value),
    complete: (outcome: string, error?: InvocationValidationError | InvocationFailure): void => {
      const now = BigInt(Date.now()) * 1_000_000n;
      span.attribute("relkit.outcome", outcome);
      if (error) {
        span.attribute("error.type", error instanceof Error ? error.name : error.kind);
        span.attribute("error.message", error.message);
        recordFailureIdentity(span, error, now);
      }
      span.end(now, error === undefined ? Exit.void : Exit.fail(error));
    },
    suspend: (): void => {
      span.attribute("relkit.outcome", "suspended");
      span.end(BigInt(Date.now()) * 1_000_000n, Exit.void);
    },
  });
}

/** Records the safe identity of a failure on its invocation span: the declared identifier of an
 * application failure as `relkit.error.id`, or an `exception` event naming the class of a
 * provider or defect failure. The cause's message never reaches the span here; the HTTP layer
 * records the redacted cause in development, where the mode is known.
 * @param span - Invocation span still open for writes.
 * @param error - Validation error or normalized invocation failure.
 * @param time - Event time in epoch nanoseconds.
 */
function recordFailureIdentity(
  span: {
    readonly attribute: (key: string, value: unknown) => void;
    readonly event: (name: string, time: bigint, attributes: Record<string, unknown>) => void;
  },
  error: InvocationValidationError | InvocationFailure,
  time: bigint,
): void {
  if (error instanceof Error) return;
  if (error.kind === "application" && error.id !== undefined)
    span.attribute("relkit.error.id", error.id);
  if (error.kind === "provider" || error.kind === "defect")
    span.event("exception", time, { "exception.type": error._tag });
}
