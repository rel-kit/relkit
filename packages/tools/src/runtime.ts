import { normalizeId } from "@relkit/contracts";
import { getDescriptorIdentityEffect } from "@relkit/invocation";
import { Effect } from "effect";
import { ToolEngineService, ToolEngineLive } from "./runtime-engine.js";
import {
  ToolCancelledFailure,
  ToolEngineFailure,
  ToolNotAllowedError,
  ToolNotAllowedFailure,
  ToolOperationCancelledError,
  ToolUnknownError,
  ToolUnknownFailure,
} from "./runtime-errors.js";
import { parseToolArgumentsEffect, validateToolArgumentsEffect } from "./runtime-input.js";
import {
  findToolEffect,
  isToolAllowedEffect,
  resolveToolTargetEffect,
} from "./runtime-resolution.js";
import {
  observeTool,
  runToolPromise,
  runToolSync,
  ToolOperationFailure,
  toolAttempt,
} from "./tool-observability.js";
import type {
  ToolEffectOptions,
  ToolInvocationContext,
  ToolRuntime,
  ToolRuntimeOptions,
} from "./runtime.types.js";

export type * from "./runtime.types.js";
export {
  ToolArgumentValidationError,
  ToolOperationCancelledError,
  ToolUnknownError,
  ToolNotAllowedError,
  ToolUnknownFailure,
  ToolNotAllowedFailure,
  ToolCancelledFailure,
  ToolArgumentsFailure,
  ToolEngineFailure,
} from "./runtime-errors.js";
export { ToolEngineService, ToolEngineLive, ToolEngineLiveEffect } from "./runtime-engine.js";
export { resolveToolTarget, resolveToolTargetEffect } from "./runtime-resolution.js";

/** Invokes an allowlisted tool with a replaceable Effect engine service.
 * Validation finishes before engine dispatch. Cancellation before dispatch
 * prevents the engine from starting. Interruption and caller cancellation reach
 * the engine through its invocation signal.
 * @param options - Tool source, request, and optional allowlist.
 * @returns Engine result or tagged lookup, policy, input, cancellation, or engine failure.
 * @example await Effect.runPromise(Effect.provide(invokeToolEffect({ tools: [tool], toolId: "orders.lookup", arguments: {} }), ToolEngineLive(engine)));
 */
export const invokeToolEffect = Effect.fn("tools.invoke")((options: ToolEffectOptions) =>
  observeTool(
    "invoke",
    Effect.gen(function* () {
      const toolId = yield* toolAttempt("invoke", () => normalizeId(options.toolId));
      const tool = yield* findToolEffect(options.tools, toolId);
      const resolvedToolId =
        tool === undefined
          ? undefined
          : yield* getDescriptorIdentityEffect(tool).pipe(
              Effect.mapError(
                (failure) =>
                  new ToolOperationFailure({
                    operation: "invoke",
                    reason: failure.message,
                    cause: failure.cause,
                  }),
              ),
            );
      if (resolvedToolId !== toolId) {
        return yield* Effect.fail(
          new ToolUnknownFailure({
            toolId,
            cause: new ToolUnknownError(toolId),
          }),
        );
      }
      if (
        options.allowedTools !== undefined &&
        !(yield* isToolAllowedEffect(toolId, options.allowedTools))
      ) {
        return yield* Effect.fail(
          new ToolNotAllowedFailure({
            toolId,
            cause: new ToolNotAllowedError(toolId),
          }),
        );
      }
      if (options.signal?.aborted) {
        return yield* Effect.fail(
          new ToolCancelledFailure({
            cause: new ToolOperationCancelledError(),
          }),
        );
      }
      const target = yield* resolveToolTargetEffect(tool);
      const input = yield* parseToolArgumentsEffect(options.arguments);
      yield* validateToolArgumentsEffect(target.input, input);
      if (options.signal?.aborted) {
        return yield* Effect.fail(
          new ToolCancelledFailure({
            cause: new ToolOperationCancelledError(),
          }),
        );
      }
      const engine = yield* ToolEngineService;
      return yield* Effect.tryPromise({
        try: (effectSignal) =>
          engine.invoke({
            functionId: target.functionId,
            input,
            source: "tool",
            inputSchema: target.input,
            outputSchema: target.output,
            ...(target.errors === undefined ? {} : { errors: target.errors }),
            ...(tool.timeoutMs === undefined ? {} : { timeoutMs: tool.timeoutMs }),
            signal:
              options.signal === undefined
                ? effectSignal
                : AbortSignal.any([options.signal, effectSignal]),
            ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
            ...(options.parent === undefined ? {} : { parent: options.parent }),
          }),
        catch: (cause) => new ToolEngineFailure({ cause }),
      });
    }),
  ),
);

/** Invokes one allowlisted tool through the common engine.
 * @param options - Runtime dependencies and invocation request.
 * @returns Promise of the engine result.
 * @throws ToolUnknownError, ToolNotAllowedError, argument errors, or engine rejection.
 * @example await invokeTool({ tools: [tool], engine, toolId: "orders.lookup", arguments: {} });
 */
export function invokeTool(options: ToolRuntimeOptions & ToolEffectOptions): Promise<unknown> {
  return runToolPromise(Effect.provide(invokeToolEffect(options), ToolEngineLive(options.engine)));
}

/** Creates a reusable compatibility runtime through Effect.
 * The allowlist is copied at creation; the caller retains ownership of tools and engine.
 * @param options - Tool source, engine, and optional allowlist.
 * @returns Frozen runtime; creation has no typed failure.
 * @example Effect.runSync(createToolRuntimeEffect({ tools: [tool], engine }));
 */
export const createToolRuntimeEffect = Effect.fn("tools.create-runtime")(
  (options: ToolRuntimeOptions) =>
    observeTool(
      "create-runtime",
      Effect.sync((): ToolRuntime => {
        const allowedTools =
          options.allowedTools === undefined ? undefined : Object.freeze([...options.allowedTools]);
        return Object.freeze({
          invoke: (toolId: string, arguments_: unknown, context: ToolInvocationContext = {}) =>
            invokeTool({
              ...options,
              toolId,
              arguments: arguments_,
              ...(allowedTools === undefined ? {} : { allowedTools }),
              ...(context.signal === undefined ? {} : { signal: context.signal }),
            }),
        });
      }),
    ),
);

/** Creates a reusable Promise runtime.
 * @param options - Tool source, engine, and optional allowlist.
 * @returns Frozen runtime.
 * @throws Unexpected defects from runtime construction.
 * @example const runtime = createToolRuntime({ tools: [tool], engine });
 */
export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  return runToolSync(createToolRuntimeEffect(options));
}
