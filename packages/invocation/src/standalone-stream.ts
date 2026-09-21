import {
  managedValidatedStream,
  normalizeFailure,
  runInInvocationScope,
  type InvocationCallStack,
  type InvocationDispatcher,
  type InvocationFailure,
  type InvocationParent,
  type TaskAncestry,
} from "./index.js";
import type { StandardSchemaV1 } from "@relkit/schema";

export function createStandaloneStream<Output>(args: {
  readonly source: AsyncIterable<unknown>;
  readonly schema: StandardSchemaV1;
  readonly controller: AbortController;
  readonly dispatcher: InvocationDispatcher;
  readonly parent: InvocationParent;
  readonly chain: InvocationCallStack;
  readonly taskAncestry?: TaskAncestry;
  readonly finish: (
    outcome: InvocationFailure["outcome"] | "success",
    error?: InvocationFailure,
  ) => Promise<void>;
}): Output {
  return managedValidatedStream({
    source: args.source,
    schema: args.schema,
    maxItemBytes: 1024 * 1024,
    idleMs: 45_000,
    abort: (reason) => args.controller.abort(reason),
    run: (work) =>
      runInInvocationScope(
        {
          dispatcher: args.dispatcher,
          parent: args.parent,
          chain: args.chain,
          ...(args.taskAncestry === undefined ? {} : { taskAncestry: args.taskAncestry }),
        },
        work,
      ),
    settle: async (streamCause) => {
      const streamError =
        streamCause === undefined
          ? undefined
          : normalizeFailure(streamCause, { signal: args.controller.signal });
      await args.finish(streamError?.outcome ?? "success", streamError);
    },
  }) as Output;
}
