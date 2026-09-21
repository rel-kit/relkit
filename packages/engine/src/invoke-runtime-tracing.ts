import { Effect } from "effect";
import type { ProtocolId } from "@relkit/contracts";
import { currentExecutionContext, type InvocationRunner } from "@relkit/invocation";
import {
  createRelkitTracer,
  IdSource,
  InvocationTrace,
  withChildSpan,
  withRootSpan,
  type CapturedInvocationTrace,
  type InvocationTraceOptions,
} from "@relkit/runtime-effect";
import type {
  InvocationIdSource,
  InvocationRecord,
  InvocationTarget,
  InvokeOptions,
} from "./invoke-types.js";

export function runTracedInvocation<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(args: {
  readonly program: Effect.Effect<unknown, unknown, never>;
  readonly runner: InvocationRunner;
  readonly spanOptions: InvocationTraceOptions;
  readonly target: InvocationTarget<Input, Output, Context>;
  readonly record: InvocationRecord;
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly controller: AbortController;
  readonly traceId: string;
  readonly idSource: InvocationIdSource;
}): Promise<unknown> {
  const capturedParent = args.options.parent?.trace as CapturedInvocationTrace | undefined;
  const spanSource: InvocationIdSource = {
    next: (kind) => (kind === "trace" ? (args.traceId as ProtocolId) : args.idSource.next(kind)),
  };
  const childTracerIds: import("@relkit/runtime-effect").IdSourceService = {
    next: (kind) => (kind === "trace" ? (args.traceId as ProtocolId) : args.idSource.next("span")),
  };
  const traced =
    currentExecutionContext() !== undefined
      ? Effect.withTracer(
          Effect.withParentSpan(
            Effect.provideService(args.program, InvocationTrace, {
              invocationId: args.record.id,
              functionId: args.target.id,
              traceId: args.traceId,
              spanId: currentExecutionContext()!.span.spanId,
              ...(args.record.parentId === undefined
                ? {}
                : { parentInvocationId: args.record.parentId }),
              ...(args.record.correlationId === undefined
                ? {}
                : { correlationId: args.record.correlationId }),
              ...(args.record.serviceId === undefined ? {} : { serviceId: args.record.serviceId }),
              source: args.record.source,
              signal: args.controller.signal,
            }),
            currentExecutionContext()!.span,
          ),
          createRelkitTracer(
            childTracerIds,
            args.spanOptions.observer,
            currentExecutionContext()!.runtime,
          ),
        )
      : capturedParent?.context === undefined || capturedParent.parentSpan === undefined
        ? withRootSpan(args.program, args.spanOptions)
        : Effect.withTracer(
            Effect.withParentSpan(
              Effect.provideService(
                withChildSpan(args.program, args.spanOptions),
                InvocationTrace,
                capturedParent.context,
              ),
              capturedParent.parentSpan,
            ),
            createRelkitTracer(childTracerIds, args.spanOptions.observer),
          );
  return args.runner.run(Effect.provideService(traced, IdSource, spanSource), {
    signal: args.controller.signal,
  });
}
