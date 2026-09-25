import { Clock, Context, Data, Effect, Exit, Option } from "effect";
import { currentExecutionContextEffect, runInExecutionContextEffect } from "./dispatcher-scope.js";
import { observeInvocation } from "./invocation-observability.js";
import { safeTraceAttributesEffect } from "./public-trace-attributes.js";
import type { FrameworkSpanOptions, MaybePromise } from "./public-trace-span.types.js";

/** Tagged failure from a handler or framework span callback.
 * @example Effect.catchTag(runTraceSpanEffect("work", callback), "TraceOperationFailure", () => Effect.void);
 */
export class TraceOperationFailure extends Data.TaggedError("TraceOperationFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Runs callback work under an active child span when a runtime is open.
 * @param name - Child span name.
 * @param optionsOrCallback - Options or callback.
 * @param callback - Callback when options are provided.
 * @param allowReserved - Whether framework attributes may use reserved keys.
 * @returns Callback value or tagged callback failure.
 * @example await Effect.runPromise(runTraceSpanEffect("lookup", async () => 1));
 */
export function runTraceSpanEffect<A>(
  name: string,
  optionsOrCallback: FrameworkSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
  allowReserved = false,
): Effect.Effect<A, TraceOperationFailure> {
  return observeInvocation(
    "trace.child-span",
    Effect.gen(function* () {
      const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
      const run = typeof optionsOrCallback === "function" ? optionsOrCallback : callback!;
      const context = yield* currentExecutionContextEffect();
      if (!context || context.runtime.closed) return yield* runCallback(run);
      const startTime = yield* Clock.currentTimeNanos;
      const attributes =
        options.attributes === undefined
          ? undefined
          : yield* safeTraceAttributesEffect(options.attributes, allowReserved);
      const child = context.runtime.start(
        {
          name,
          parent: Option.some(context.span),
          annotations: Context.empty(),
          links: [],
          startTime,
          kind: options.kind ?? "internal",
          root: false,
          sampled: context.span.sampled,
        },
        attributes,
      );
      if ("input" in options) child.capture("input", options.input);
      return yield* Effect.onInterrupt(
        Effect.matchEffect(
          Effect.flatMap(
            runInExecutionContextEffect({ ...context, span: child }, () =>
              Promise.resolve().then(run),
            ),
            (pending) =>
              Effect.tryPromise({
                try: () => pending,
                catch: (cause) =>
                  new TraceOperationFailure({ cause, message: "Trace callback failed" }),
              }),
          ),
          {
            onFailure: (failure) =>
              Effect.gen(function* () {
                child.end(yield* Clock.currentTimeNanos, Exit.fail(failure.cause));
                return yield* Effect.fail(failure);
              }),
            onSuccess: (value) =>
              Effect.gen(function* () {
                child.capture("output", value);
                child.end(yield* Clock.currentTimeNanos, Exit.void);
                return value;
              }),
          },
        ),
        () =>
          Effect.gen(function* () {
            child.end(yield* Clock.currentTimeNanos, Exit.interrupt());
          }),
      );
    }),
  );
}

/** Promise adapter for a traced callback.
 * @param name - Child span name.
 * @param optionsOrCallback - Options or callback.
 * @param callback - Callback when options are provided.
 * @param allowReserved - Whether reserved attributes are allowed.
 * @returns Callback value.
 * @throws The original callback error.
 * @example await runTraceSpan("lookup", async () => 1);
 */
export async function runTraceSpan<A>(
  name: string,
  optionsOrCallback: FrameworkSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
  allowReserved = false,
): Promise<A> {
  try {
    return await Effect.runPromise(
      runTraceSpanEffect(name, optionsOrCallback, callback, allowReserved),
    );
  } catch (cause) {
    if (cause instanceof TraceOperationFailure) throw cause.cause;
    throw cause;
  }
}

function runCallback<A>(run: () => MaybePromise<A>): Effect.Effect<A, TraceOperationFailure> {
  return Effect.tryPromise({
    try: () => Promise.resolve().then(run),
    catch: (cause) => new TraceOperationFailure({ cause, message: "Trace callback failed" }),
  });
}
