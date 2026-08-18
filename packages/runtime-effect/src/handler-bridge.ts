import { Effect } from "effect";
import type { MaybePromise } from "@zsys/contracts";
import { createAbortBridge } from "./abort.js";
import { withDeadline, withTimeout } from "./deadline.js";
import { normalizeFailure } from "./failure.js";
import type { InvocationFailure } from "./failure-types.js";

export interface HandlerBridgeOptions<Input, Output, Context extends object> {
  readonly handler: (input: Input, context: Context) => MaybePromise<Output>;
  readonly input: Input;
  readonly publicContext: Context;
  readonly deadline?: number;
  readonly timeoutMs?: number;
  readonly onSignal?: (signal: AbortSignal) => void;
}

/**
 * Converts one plain handler call into an Effect without creating a runtime.
 * The caller owns the active generation/invocation scope, so interruption and
 * service context remain attached to the fiber that evaluates this effect.
 */
export function invokeUserHandler<Input, Output, Context extends { readonly signal: AbortSignal }>(
  options: HandlerBridgeOptions<Input, Output, Context>,
): Effect.Effect<Output, InvocationFailure> {
  const execution = Effect.callback<Output, InvocationFailure>((resume, fiberSignal) => {
    const bridge = createAbortBridge(fiberSignal, options.publicContext.signal);
    options.onSignal?.(bridge.signal);
    let completed = false;

    const cleanup = (): void => {
      bridge.signal.removeEventListener("abort", onAbort);
      bridge.dispose();
    };
    const complete = (effect: Effect.Effect<Output, InvocationFailure>): void => {
      if (completed) return;
      completed = true;
      cleanup();
      resume(effect);
    };
    const onAbort = (): void =>
      complete(
        Effect.fail(
          normalizeFailure(bridge.signal.reason, {
            signal: bridge.signal,
          }),
        ),
      );

    if (bridge.signal.aborted) {
      complete(Effect.fail(normalizeFailure(bridge.signal.reason, { signal: bridge.signal })));
      return;
    }
    bridge.signal.addEventListener("abort", onAbort, { once: true });
    const context = Object.freeze({ ...options.publicContext, signal: bridge.signal }) as Context;

    let result: MaybePromise<Output>;
    try {
      result = options.handler(options.input, context);
    } catch (cause) {
      complete(Effect.fail(normalizeFailure(cause, { signal: bridge.signal })));
      return;
    }

    Promise.resolve(result).then(
      (value) =>
        complete(
          bridge.signal.aborted
            ? Effect.fail(normalizeFailure(bridge.signal.reason, { signal: bridge.signal }))
            : Effect.succeed(value),
        ),
      (cause) => complete(Effect.fail(normalizeFailure(cause, { signal: bridge.signal }))),
    );

    return Effect.sync(cleanup);
  });
  if (options.deadline === undefined && options.timeoutMs === undefined) return execution;
  const timed =
    options.timeoutMs === undefined
      ? withDeadline(execution, options.deadline)
      : withTimeout(execution, options.timeoutMs, options.deadline);
  return timed.pipe(Effect.mapError((cause) => normalizeFailure(cause)));
}
