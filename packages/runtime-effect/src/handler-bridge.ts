import { Effect } from "effect";
import type { FunctionRequest, MaybePromise } from "@zsys/contracts";
import { createAbortBridge } from "./abort.js";
import { withDeadline, withTimeout } from "./deadline.js";
import { isDeclaredError, isFunctionFailure } from "./failure-guards.js";
import { normalizeFailure } from "./failure.js";
import type { InvocationFailure } from "./failure-types.js";

export interface HandlerBridgeOptions<Input, Output, Context extends object> {
  readonly handler: (
    input: Input,
    request: FunctionRequest | undefined,
    context: Context,
  ) => MaybePromise<unknown>;
  readonly input: Input;
  readonly request?: FunctionRequest;
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
      resume(effect.pipe(Effect.ensuring(Effect.sync(cleanup))));
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

    let result: MaybePromise<unknown>;
    try {
      result = options.handler(options.input, options.request, context);
    } catch (cause) {
      complete(Effect.fail(normalizeFailure(cause, { signal: bridge.signal })));
      return;
    }

    Promise.resolve(result).then(
      (value) => completeValue(value, bridge.signal, complete),
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

function completeValue<Output>(
  value: unknown,
  signal: AbortSignal,
  complete: (effect: Effect.Effect<Output, InvocationFailure>) => void,
): void {
  if (signal.aborted) {
    complete(Effect.fail(normalizeFailure(signal.reason, { signal })));
    return;
  }
  if (isFunctionFailure(value)) {
    complete(Effect.fail(normalizeFailure(value.error, { signal })));
    return;
  }
  if (isDeclaredError(value)) {
    complete(Effect.fail(normalizeFailure(value, { signal })));
    return;
  }
  if (Effect.isEffect(value)) {
    const effect = value.pipe(
      Effect.flatMap((result) =>
        signal.aborted
          ? Effect.fail(normalizeFailure(signal.reason, { signal }))
          : isFunctionFailure(result)
            ? Effect.fail(normalizeFailure(result.error, { signal }))
            : isDeclaredError(result)
              ? Effect.fail(normalizeFailure(result, { signal }))
              : Effect.succeed(result as Output),
      ),
      Effect.mapError((cause) => normalizeFailure(cause, { signal })),
    );
    complete(effect as Effect.Effect<Output, InvocationFailure>);
    return;
  }
  complete(Effect.succeed(value as Output));
}
