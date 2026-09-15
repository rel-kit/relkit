import { Effect } from "effect";
import type { MaybePromise } from "@relkit/contracts";
import { createAbortBridge } from "./abort.js";
import { withDeadline, withTimeout } from "./deadline.js";
import { isDeclaredError, isFunctionFailure } from "./failure-guards.js";
import { normalizeFailure } from "./failure.js";
import type { InvocationFailure } from "./failure-types.js";
import { isNativeSuspension, markNativeSuspension } from "./native-suspension.js";

export interface HandlerBridgeOptions<Input, Output, Context extends object> {
  readonly handler: (input: Input, context: Context) => MaybePromise<unknown>;
  readonly input: Input;
  readonly publicContext: Context;
  readonly deadline?: number;
  readonly timeoutMs?: number;
  readonly onSignal?: (signal: AbortSignal) => void;
  readonly isSuspension?: (cause: unknown) => boolean;
}

interface SuspensionOptions {
  readonly isSuspension?: (cause: unknown) => boolean;
}

/** Converts one plain handler call into an Effect without creating a runtime. */
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
      result = options.handler(options.input, context);
    } catch (cause) {
      complete(Effect.fail(normalizeCause(cause, options, bridge.signal)));
      return;
    }

    Promise.resolve(result).then(
      (value) => completeValue(value, bridge.signal, complete, options),
      (cause) => complete(Effect.fail(normalizeCause(cause, options, bridge.signal))),
    );

    return Effect.sync(cleanup);
  });
  if (options.deadline === undefined && options.timeoutMs === undefined) return execution;
  const timed =
    options.timeoutMs === undefined
      ? withDeadline(execution, options.deadline)
      : withTimeout(execution, options.timeoutMs, options.deadline);
  return timed.pipe(
    Effect.mapError((cause) => (isNativeSuspension(cause) ? cause : normalizeFailure(cause))),
  ) as Effect.Effect<Output, InvocationFailure>;
}

function completeValue<Output>(
  value: unknown,
  signal: AbortSignal,
  complete: (effect: Effect.Effect<Output, InvocationFailure>) => void,
  options: SuspensionOptions,
): void {
  if (signal.aborted) {
    complete(Effect.fail(normalizeFailure(signal.reason, { signal })));
    return;
  }
  if (isFunctionFailure(value)) {
    complete(Effect.fail(normalizeCause(value.error, options, signal)));
    return;
  }
  if (isDeclaredError(value)) {
    complete(Effect.fail(normalizeCause(value, options, signal)));
    return;
  }
  if (Effect.isEffect(value)) {
    const effect = value.pipe(
      Effect.flatMap((result) =>
        signal.aborted
            ? Effect.fail(normalizeFailure(signal.reason, { signal }))
            : isFunctionFailure(result)
              ? Effect.fail(normalizeCause(result.error, options, signal))
              : isDeclaredError(result)
                ? Effect.fail(normalizeCause(result, options, signal))
                : Effect.succeed(result as Output),
      ),
      Effect.mapError((cause) => normalizeCause(cause, options, signal)),
    );
    complete(effect as Effect.Effect<Output, InvocationFailure>);
    return;
  }
  complete(Effect.succeed(value as Output));
}

function normalizeCause(
  cause: unknown,
  options: { readonly isSuspension?: (cause: unknown) => boolean },
  signal: AbortSignal,
): InvocationFailure {
  if (options.isSuspension?.(cause) === true) {
    return markNativeSuspension(cause) as unknown as InvocationFailure;
  }
  return normalizeFailure(cause, { signal });
}
