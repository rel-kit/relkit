import { Context, Exit, Option, Tracer } from "effect";
import {
  currentExecutionContext,
  runInExecutionContext,
  SpanRuntime,
  type InvocationFailure,
} from "@relkit/invocation";
import { isSpanId, isTraceId, type ProtocolId } from "@relkit/contracts";
import { createInvocationSpanOptions } from "./invoke-tracing.js";
import type {
  InvocationIdSource,
  InvocationRecord,
  InvocationTarget,
  InvocationValidationError,
  InvokeOptions,
} from "./invoke-types.js";

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
    captureInput: (value: unknown): void => span.capture("input", value),
    captureOutput: (value: unknown): void => span.capture("output", value),
    complete: (outcome: string, error?: InvocationValidationError | InvocationFailure): void => {
      span.attribute("relkit.outcome", outcome);
      if (error) {
        span.attribute("error.type", error instanceof Error ? error.name : error.kind);
        span.attribute("error.message", error.message);
      }
      span.end(BigInt(Date.now()) * 1_000_000n, error === undefined ? Exit.void : Exit.fail(error));
    },
  });
}
