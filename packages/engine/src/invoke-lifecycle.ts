import type { MaybePromise } from "@relkit/contracts";
import {
  baseExecutionContext,
  findNativeSuspension,
  invokeFunctionLifecycle,
  invokeValueHook,
} from "@relkit/invocation";
import { Clock, Effect, Option } from "effect";
import { enginePromise } from "./engine-runtime.js";
import type { LifecycleOptions } from "./invoke-lifecycle.types.js";

/** Run shared validation and handler lifecycle with bounded native task hooks.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A lazy Effect of validated handler output, preserving failure and suspension semantics.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export const runConfiguredLifecycle = Effect.fn("Engine.invocation.lifecycle")(function* <
  Context extends { readonly signal: AbortSignal },
>(options: LifecycleOptions<Context>) {
  const hookContext = baseExecutionContext(options.context) as unknown as Context;
  const input =
    options.skipInputValidation === true && options.toolHooks?.onBefore === undefined
      ? options.input
      : yield* invokeValueHook({
          hook: options.toolHooks?.onBefore,
          value: options.input,
          schema: options.target.input,
          context: hookContext,
          ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
          onSignal: options.onSignal,
          ...(options.isSuspension === undefined ? {} : { isSuspension: options.isSuspension }),
        });
  const attempt = Effect.gen(function* () {
    yield* runTaskHook(
      options.taskLifecycle?.onStart,
      "start",
      input,
      options.context,
      options.deadline,
    );
    const output = yield* invokeFunctionLifecycle({
      target: options.target,
      input,
      context: options.context,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
      onSignal: options.onSignal,
      ...(options.isSuspension === undefined ? {} : { isSuspension: options.isSuspension }),
      validateInput: options.skipInputValidation !== true,
    });
    const after =
      options.toolHooks?.onAfter === undefined
        ? output
        : yield* invokeValueHook({
            hook: options.toolHooks.onAfter,
            value: output,
            schema: options.target.output,
            context: hookContext,
            ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
            onSignal: options.onSignal,
            ...(options.isSuspension === undefined ? {} : { isSuspension: options.isSuspension }),
          });
    yield* runTaskHook(
      options.taskLifecycle?.onSuccess,
      "success",
      after,
      options.context,
      options.deadline,
    );
    return after;
  });
  return yield* attempt.pipe(
    Effect.catchCause((cause) => {
      const suspension = findNativeSuspension(cause);
      return suspension !== undefined
        ? Effect.fail(suspension as unknown as import("@relkit/invocation").InvocationFailure)
        : runTaskHook(
            options.taskLifecycle?.onFailure,
            "failure",
            cause,
            options.context,
            options.deadline,
          ).pipe(Effect.flatMap(() => Effect.failCause(cause)));
    }),
  );
});

const TASK_HOOK_TIMEOUT_MS = 5_000;

/** Execute observational hooks with a bounded, interruptible Effect timeout.
 * @typeParam Context - Handler context retaining its public AbortSignal.
 * @param hook - Optional lifecycle observer.
 * @param name - Bounded hook identity.
 * @param value - Hook value, never copied into diagnostics.
 * @param context - Public handler context.
 * @param deadline - Absolute invocation deadline in milliseconds.
 * @returns A lazy diagnostic-only hook; absent hooks create no span and interruption remains interruption.
 */
export function runTaskHook<Context extends { readonly signal: AbortSignal }>(
  hook: ((value: unknown, context: Context) => MaybePromise<void>) | undefined,
  name: "start" | "success" | "failure",
  value: unknown,
  context: Context,
  deadline: number | undefined,
) {
  return hook === undefined
    ? Effect.void
    : runDefinedTaskHook(hook, name, value, context, deadline);
}

/** Run a configured observer within its named span and bounded timeout.
 * @typeParam Context - Handler context retaining its public AbortSignal.
 * @param hook - Configured lifecycle observer.
 * @param name - Bounded hook identity.
 * @param value - Hook value, never copied into diagnostics.
 * @param context - Public handler context.
 * @param deadline - Absolute invocation deadline in milliseconds.
 * @returns A lazy diagnostic-only hook; interruption remains interruption.
 */
const runDefinedTaskHook = Effect.fn("Engine.task.hook")(function* <
  Context extends { readonly signal: AbortSignal },
>(
  hook: (value: unknown, context: Context) => MaybePromise<void>,
  name: "start" | "success" | "failure",
  value: unknown,
  context: Context,
  deadline: number | undefined,
) {
  const now = yield* Clock.currentTimeMillis;
  const remaining = deadline === undefined ? TASK_HOOK_TIMEOUT_MS : Math.max(0, deadline - now);
  const limit = Math.min(TASK_HOOK_TIMEOUT_MS, remaining);
  if (limit === 0) {
    warnHook(context, name, "deadline");
    return;
  }
  yield* enginePromise((signal) => Promise.resolve(hook(value, { ...context, signal }))).pipe(
    Effect.timeoutOption(limit),
    Effect.matchEffect({
      onFailure: () => Effect.sync(() => warnHook(context, name, "error")),
      onSuccess: (result) =>
        Effect.sync(() => {
          if (Option.isNone(result)) warnHook(context, name, "timeout");
        }),
    }),
  );
});

/** Report a bounded task hook diagnostic through the handler's public logger.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns Nothing; reports only a bounded diagnostic through the caller's logger.
 * @param context - Active native invocation or task context.
 * @param name - Declared operation, dependency or field name.
 * @param reason - Bounded diagnostic reason without native payload data.
 */
function warnHook<Context extends { readonly signal: AbortSignal }>(
  context: Context,
  name: string,
  reason: string,
): void {
  try {
    const log = (context as Context & { readonly log?: { readonly warn?: Function } }).log;
    log?.warn?.("Task lifecycle hook diagnostic", { hook: name, reason });
  } catch {
    // Observational hooks never change the task outcome.
  }
}
