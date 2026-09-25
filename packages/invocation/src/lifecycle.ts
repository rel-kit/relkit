import { Effect } from "effect";
import { invokeUserHandler } from "./handler-bridge.js";
import { normalizeFailure } from "./failure.js";
import type { InvocationFailure } from "./failure.types.js";
import { validatedEffect } from "./validation.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { BaseExecutionContext, LifecycleOptions, ValueHookOptions } from "./lifecycle.types.js";
import type { StandardSchemaV1 } from "@relkit/schema";

export type { BaseExecutionContext, LifecycleOptions, ValueHookOptions } from "./lifecycle.types.js";

/** Runs target before hook, handler, output validation, and after hook in order.
 * @param options - Target, input, context, deadline, and validation flags.
 * @returns Validated output or an invocation failure.
 * @example await Effect.runPromise(invokeFunctionLifecycle({ target, input, context }));
 */
export function invokeFunctionLifecycle<Context extends { readonly signal: AbortSignal }>(
  options: LifecycleOptions<Context>,
): Effect.Effect<unknown, InvocationFailure> {
  const before = invokeValue(
    options.target.onBefore,
    options.input,
    options.context,
    options.deadline,
    options.onSignal,
    options.isSuspension,
  ).pipe(
    Effect.flatMap((value) =>
      options.validateInput === false
        ? Effect.succeed(value)
        : validateOutput(options.target.input, value),
    ),
  );
  return observeInvocation("lifecycle.function", before.pipe(
    Effect.flatMap((input) =>
      invokeValue(
        options.target.handler,
        input,
        options.context,
        options.deadline,
        options.onSignal,
        options.isSuspension,
      ),
    ),
    Effect.flatMap((value) =>
      options.validateOutput === false
        ? Effect.succeed(value)
        : validateOutput(
            options.target.output,
            value,
            options.target.invocationMode === "event-only",
          ),
    ),
    Effect.flatMap((output) =>
      invokeValue(
        options.target.onAfter,
        output,
        options.context,
        options.deadline,
        options.onSignal,
        options.isSuspension,
      ),
    ),
    Effect.flatMap((value) =>
      options.target.onAfter === undefined
        ? Effect.succeed(value)
        : validateOutput(
            options.target.output,
            value,
            options.target.invocationMode === "event-only",
          ),
    ),
  ));
}

/** Runs and validates one value hook through Effect.
 * @param options - Hook, value, schema, and public context.
 * @returns Validated value or an invocation failure.
 * @example await Effect.runPromise(invokeValueHook({ hook, value, schema, context }));
 */
export function invokeValueHook<Context extends { readonly signal: AbortSignal }>(
  options: ValueHookOptions<Context>,
): Effect.Effect<unknown, InvocationFailure> {
  return observeInvocation("lifecycle.value-hook", invokeValue(
    options.hook,
    options.value,
    options.context,
    options.deadline,
    options.onSignal,
    options.isSuspension,
  ).pipe(Effect.flatMap((value) => validateOutput(options.schema, value))));
}

/** Builds the restricted context visible to tool value hooks.
 * @param value - Full handler context.
 * @returns Immutable invocation, signal, environment, logger, and time fields.
 * @example Effect.runSync(baseExecutionContextEffect(context));
 */
export function baseExecutionContextEffect(value: unknown): Effect.Effect<BaseExecutionContext> {
  return observeInvocation("lifecycle.base-context", Effect.sync(() => {
    const context = value as Record<string, unknown> & { readonly signal: AbortSignal };
    return Object.freeze({
      invocation: context.invocation,
      signal: context.signal,
      env: context.env,
      log: context.log,
      time: context.time,
    });
  }));
}

/** Synchronous restricted context adapter.
 * @param value - Full handler context.
 * @returns Immutable base context.
 * @example baseExecutionContext(context);
 */
export function baseExecutionContext(value: unknown): BaseExecutionContext {
  return runInvocationSync(baseExecutionContextEffect(value));
}

function invokeValue<Context extends { readonly signal: AbortSignal }>(
  handler: ((value: unknown, context: Context) => unknown) | undefined,
  value: unknown,
  context: Context,
  deadline: number | undefined,
  onSignal: ((signal: AbortSignal) => void) | undefined,
  isSuspension: ((cause: unknown) => boolean) | undefined,
): Effect.Effect<unknown, InvocationFailure> {
  if (handler === undefined) return Effect.succeed(value);
  return invokeUserHandler({
    handler,
    input: value,
    publicContext: context,
    ...(deadline === undefined ? {} : { deadline }),
    ...(onSignal === undefined ? {} : { onSignal }),
    ...(isSuspension === undefined ? {} : { isSuspension }),
  });
}

function validateOutput(
  schema: StandardSchemaV1,
  value: unknown,
  eventOnly = false,
): Effect.Effect<unknown, InvocationFailure> {
  return observeInvocation("lifecycle.validate-output", Effect.gen(function* () {
    if (eventOnly && value !== undefined)
      return yield* Effect.fail(normalizeFailure(new TypeError("Event-only functions must return void on success")));
    return yield* Effect.mapError(validatedEffect(schema, value, "output"),
      (failure) => normalizeFailure(failure.cause));
  }));
}
