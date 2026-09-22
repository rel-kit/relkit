import {
  managedValidatedStream,
  normalizeFailure,
  runInInvocationScope,
  type InvocationCallStack,
  type InvocationDispatcher,
  type TaskAncestry,
  type InvocationFailure,
} from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import { completeInvocation } from "./invoke-completion.js";
import type {
  InvocationOutcome,
  InvocationParent,
  InvocationRecord,
  InvokeOptions,
} from "./invoke-types.js";

interface InvocationExecution {
  run<A>(callback: () => A): A;
  complete(outcome: string, error?: unknown): void;
}

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
      await completeInvocation({
        record: args.record,
        outcome: streamOutcome,
        error: streamError as InvocationFailure | undefined,
        options: args.options,
        lease: args.lease,
        admitted: args.admitted,
        unlink: args.unlink,
      });
    },
  }) as Output;
}
