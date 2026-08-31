import { Effect } from "effect";
import type { StandardSchemaV1 } from "@relkit/schema";
import { invokeUserHandler } from "./handler-bridge.js";
import type { InvocationTarget } from "./contracts.js";
import type { InvocationValueHooks } from "./dispatcher-types.js";
import { normalizeFailure } from "./failure.js";
import type { InvocationFailure } from "./failure-types.js";
import { validated } from "./validation.js";

interface LifecycleOptions<Context extends { readonly signal: AbortSignal }> {
  readonly target: InvocationTarget<unknown, unknown, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly deadline?: number;
  readonly onSignal?: (signal: AbortSignal) => void;
}

interface ValueHookOptions<Context extends { readonly signal: AbortSignal }> {
  readonly hook: InvocationValueHooks<Context>["onBefore"];
  readonly value: unknown;
  readonly schema: StandardSchemaV1;
  readonly context: Context;
  readonly deadline?: number;
  readonly onSignal?: (signal: AbortSignal) => void;
}

export function invokeFunctionLifecycle<Context extends { readonly signal: AbortSignal }>(
  options: LifecycleOptions<Context>,
): Effect.Effect<unknown, InvocationFailure> {
  const before = invokeValue(
    options.target.onBefore,
    options.input,
    options.context,
    options.deadline,
    options.onSignal,
  ).pipe(Effect.flatMap((value) => validateOutput(options.target.input, value)));
  return before.pipe(
    Effect.flatMap((input) =>
      invokeValue(
        options.target.handler,
        input,
        options.context,
        options.deadline,
        options.onSignal,
      ),
    ),
    Effect.flatMap((value) =>
      validateOutput(options.target.output, value, options.target.invocationMode === "event-only"),
    ),
    Effect.flatMap((output) =>
      invokeValue(
        options.target.onAfter,
        output,
        options.context,
        options.deadline,
        options.onSignal,
      ),
    ),
    Effect.flatMap((value) =>
      validateOutput(options.target.output, value, options.target.invocationMode === "event-only"),
    ),
  );
}

export function invokeValueHook<Context extends { readonly signal: AbortSignal }>(
  options: ValueHookOptions<Context>,
): Effect.Effect<unknown, InvocationFailure> {
  return invokeValue(
    options.hook,
    options.value,
    options.context,
    options.deadline,
    options.onSignal,
  ).pipe(Effect.flatMap((value) => validateOutput(options.schema, value)));
}

export function baseExecutionContext(value: unknown): {
  readonly invocation: unknown;
  readonly signal: AbortSignal;
  readonly env: unknown;
  readonly log: unknown;
  readonly time: unknown;
} {
  const context = value as Record<string, unknown> & { readonly signal: AbortSignal };
  return Object.freeze({
    invocation: context.invocation,
    signal: context.signal,
    env: context.env,
    log: context.log,
    time: context.time,
  });
}

function invokeValue<Context extends { readonly signal: AbortSignal }>(
  handler: ((value: unknown, context: Context) => unknown) | undefined,
  value: unknown,
  context: Context,
  deadline: number | undefined,
  onSignal: ((signal: AbortSignal) => void) | undefined,
): Effect.Effect<unknown, InvocationFailure> {
  if (handler === undefined) return Effect.succeed(value);
  return invokeUserHandler({
    handler,
    input: value,
    publicContext: context,
    ...(deadline === undefined ? {} : { deadline }),
    ...(onSignal === undefined ? {} : { onSignal }),
  });
}

function validateOutput(
  schema: StandardSchemaV1,
  value: unknown,
  eventOnly = false,
): Effect.Effect<unknown, InvocationFailure> {
  return Effect.tryPromise({
    try: async () => {
      if (eventOnly && value !== undefined)
        throw new TypeError("Event-only functions must return void on success");
      return validated(schema, value, "output");
    },
    catch: (cause) => normalizeFailure(cause),
  });
}
