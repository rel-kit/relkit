import {
  managedValidatedStream,
  normalizeFailure,
  runInInvocationScope,
  type InvocationCallStack,
  type InvocationDispatcher,
  type InvocationFailure,
  type TaskAncestry,
} from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import { completeInvocation } from "./invoke-completion.js";
import type { InvocationExecution } from "./invoke-now-stream.types.js";
import type {
  InvocationOutcome,
  InvocationParent,
  InvocationRecord,
  InvokeOptions,
} from "./invoke-types.js";

/** Transfer validation, admission and observation ownership to stream consumption.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns Lazy validated output whose settlement releases admission and observation scope.
 * @param args - Execution metadata and resources whose ownership is retained by this operation.
 */
export function createInvocationStream<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(args: {
  readonly source: AsyncIterable<unknown>;
  readonly schema: StandardSchemaV1;
  readonly controller: AbortController;
  readonly execution: InvocationExecution;
  readonly dispatcher: InvocationDispatcher;
  readonly parent: InvocationParent;
  readonly chain: InvocationCallStack;
  readonly taskAncestry?: TaskAncestry;
  readonly progress: { readonly settle: () => void } | undefined;
  readonly record: InvocationRecord;
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly lease: { readonly release: () => unknown } | undefined;
  readonly admitted: boolean;
  readonly unlink: () => void;
  readonly closeObservations?: () => Promise<void>;
}): Output {
  return managedValidatedStream({
    source: args.source,
    schema: args.schema,
    maxItemBytes: 1024 * 1024,
    idleMs: 45_000,
    abort: (reason) => args.controller.abort(reason),
    run: (work) =>
      args.execution.run(() =>
        runInInvocationScope(
          {
            dispatcher: args.dispatcher,
            parent: args.parent,
            chain: args.chain,
            ...(args.taskAncestry === undefined ? {} : { taskAncestry: args.taskAncestry }),
          },
          work,
        ),
      ),
    settle: async (streamCause) => {
      args.progress?.settle();
      const streamError =
        streamCause === undefined
          ? undefined
          : normalizeFailure(streamCause, { signal: args.controller.signal });
      const streamOutcome: InvocationOutcome = streamError?.outcome ?? "success";
      args.execution.complete(streamOutcome, streamError);
      try {
        await completeInvocation({
          record: args.record,
          outcome: streamOutcome,
          error: streamError as InvocationFailure | undefined,
          options: args.options,
          lease: args.lease,
          admitted: args.admitted,
          unlink: args.unlink,
        });
      } finally {
        await args.closeObservations?.();
      }
    },
  }) as Output;
}
