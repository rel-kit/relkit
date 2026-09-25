import { Effect } from "effect";
import { managedValidatedStreamEffect } from "./managed-stream.js";
import { normalizeFailure } from "./failure.js";
import { runInInvocationScope } from "./dispatcher-scope.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { StandaloneStreamOptions } from "./standalone-stream.types.js";

export type { StandaloneStreamOptions } from "./standalone-stream.types.js";

/** Builds a deferred validated stream with scoped dispatch and finalization.
 * @param args - Stream source, invocation scope, and finalizer.
 * @returns A managed stream with no expected creation failure; iteration has typed failures.
 * @example Effect.runSync(createStandaloneStreamEffect({ source, schema, controller, dispatcher, parent, chain, finish }));
 */
export function createStandaloneStreamEffect<Output>(
  args: StandaloneStreamOptions,
): Effect.Effect<Output> {
  return observeInvocation("standalone.stream-create", Effect.map(managedValidatedStreamEffect({
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
          : normalizeFailure(streamCause);
      await args.finish(streamError?.outcome ?? "success", streamError);
    },
  }), (stream) => stream as Output));
}

/** Synchronous compatibility adapter for deferred standalone streams.
 * @param args - Stream source, invocation scope, and finalizer.
 * @returns A managed async iterable.
 * @throws An unexpected defect if creation fails.
 * @example createStandaloneStream({ source, schema, controller, dispatcher, parent, chain, finish });
 */
export function createStandaloneStream<Output>(args: StandaloneStreamOptions): Output {
  return runInvocationSync(createStandaloneStreamEffect<Output>(args));
}
