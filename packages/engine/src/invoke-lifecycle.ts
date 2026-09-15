import { Effect } from "effect";
import type { MaybePromise } from "@relkit/contracts";
import {
  baseExecutionContext,
  findNativeSuspension,
  invokeFunctionLifecycle,
  invokeValueHook,
  type InvocationValueHooks,
} from "@relkit/invocation";
import type { InvocationTarget, TaskLifecycleHooks } from "./invoke-types.js";

interface LifecycleOptions<Context extends { readonly signal: AbortSignal }> {
  readonly target: InvocationTarget<unknown, unknown, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly deadline?: number;
  readonly onSignal: (signal: AbortSignal) => void;
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly skipInputValidation?: boolean;
  readonly taskLifecycle?: TaskLifecycleHooks<Context>;
}

export const runConfiguredLifecycle = Effect.fnUntraced(function* <
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
    yield* runTaskHook(options.taskLifecycle?.onStart, "start", input, options.context, options.deadline);
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
    yield* runTaskHook(options.taskLifecycle?.onSuccess, "success", after, options.context, options.deadline);
    return after;
  });
  return yield* attempt.pipe(
    Effect.catchCause((cause) => {
      const suspension = findNativeSuspension(cause);
      return suspension !== undefined
        ? Effect.fail(suspension as unknown as import("@relkit/invocation").InvocationFailure)
        : runTaskHook(options.taskLifecycle?.onFailure, "failure", cause, options.context, options.deadline).pipe(
            Effect.flatMap(() => Effect.failCause(cause)),
          );
    }),
  );
});

const TASK_HOOK_TIMEOUT_MS = 5_000;

function runTaskHook<Context extends { readonly signal: AbortSignal }>(
  hook: ((value: unknown, context: Context) => MaybePromise<void>) | undefined,
  name: "start" | "success" | "failure",
  value: unknown,
  context: Context,
  deadline: number | undefined,
): Effect.Effect<void, never> {
  if (hook === undefined) return Effect.void;
  return Effect.tryPromise({
    try: () => boundedTaskHook(hook, name, value, context, deadline),
    catch: () => undefined,
  }).pipe(Effect.asVoid, Effect.catchCause(() => Effect.void));
}

async function boundedTaskHook<Context extends { readonly signal: AbortSignal }>(
  hook: (value: unknown, context: Context) => MaybePromise<void>,
  name: "start" | "success" | "failure",
  value: unknown,
  context: Context,
  deadline: number | undefined,
): Promise<void> {
  const remaining = deadline === undefined ? TASK_HOOK_TIMEOUT_MS : Math.max(0, deadline - Date.now());
  const limit = Math.min(TASK_HOOK_TIMEOUT_MS, remaining);
  if (limit === 0) {
    warnHook(context, name, "deadline");
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => hook(value, context)),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          warnHook(context, name, "timeout");
          resolve();
        }, limit);
      }),
    ]);
  } catch {
    warnHook(context, name, "error");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

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
