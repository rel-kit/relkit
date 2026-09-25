import { Effect } from "effect";
import { isStreamOutput, lazySingleConsumerStream } from "./stream-runtime.js";
import { invokeStandaloneEffect, StandaloneInvocationFailure } from "./standalone-invoke.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  InvocationDispatchOptions,
  InvocationDispatchRequest,
  InvocationDispatcher,
  StandaloneDispatcherOptions,
} from "./standalone-dispatcher.types.js";

/** Creates a standalone dispatcher with lazily consumed stream outputs.
 * @param baseOptions - Default dispatch controls.
 * @returns An immutable dispatcher with no expected creation failure.
 * @example Effect.runSync(createStandaloneDispatcherEffect());
 */
export function createStandaloneDispatcherEffect(
  baseOptions: StandaloneDispatcherOptions = {},
): Effect.Effect<InvocationDispatcher> {
  return observeInvocation("standalone.dispatcher-create", Effect.sync(() => {
    let dispatcher!: InvocationDispatcher;
    dispatcher = Object.freeze({
      dispatch: <Input, Output, Context extends { readonly signal: AbortSignal }>(
        request: InvocationDispatchRequest<Input, Output, Context>,
      ) => {
        const options = { ...baseOptions, ...request.options } as InvocationDispatchOptions<Context>;
        if (isStreamOutput(request.target.output)) {
          return Promise.resolve(lazySingleConsumerStream(
            () => runStandalone(request, options, dispatcher, true) as Promise<AsyncIterable<unknown>>,
          ) as Output);
        }
        return runStandalone(request, options, dispatcher, false);
      },
    });
    return dispatcher;
  }));
}

/** Synchronous standalone dispatcher compatibility adapter.
 * @param baseOptions - Default dispatch controls.
 * @returns An immutable dispatcher.
 * @example createStandaloneDispatcher();
 */
export function createStandaloneDispatcher(baseOptions: StandaloneDispatcherOptions = {}): InvocationDispatcher {
  return runInvocationSync(createStandaloneDispatcherEffect(baseOptions));
}

async function runStandalone<Input, Output, Context extends { readonly signal: AbortSignal }>(
  request: InvocationDispatchRequest<Input, Output, Context>,
  options: InvocationDispatchOptions<Context>,
  dispatcher: InvocationDispatcher,
  streamLifecycle: boolean,
): Promise<Output> {
  try { return await Effect.runPromise(invokeStandaloneEffect(request, options, dispatcher, streamLifecycle)); }
  catch (cause) {
    if (cause instanceof StandaloneInvocationFailure) throw cause.cause;
    throw cause;
  }
}
