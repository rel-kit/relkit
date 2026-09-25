import { Context, Data, Effect, Layer, Option } from "effect";
import { createStandaloneDispatcher } from "./standalone-dispatcher.js";
import { linkSignals } from "./context.js";
import { currentInvocationScope, runInInvocationScope } from "./dispatcher-scope.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  InvocationDispatchRequest,
  InvocationDispatcher,
  DispatcherBoundaryService,
} from "./dispatcher.types.js";

/** Substitutable lookup and fallback for invocation dispatch.
 * @example Effect.provide(dispatchInvocationEffect(request), DispatcherBoundaryLive);
 */
export class DispatcherBoundary extends Context.Service<
  DispatcherBoundary,
  DispatcherBoundaryService
>()("relkit/invocation/DispatcherBoundary") {}

const liveBoundary: DispatcherBoundaryService = {
  current: () => currentInvocationScope()?.dispatcher,
  fallback: createStandaloneDispatcher,
};

/** Live invocation dispatcher boundary.
 * @example Effect.runPromise(Effect.provide(dispatchInvocationEffect(request), DispatcherBoundaryLive));
 */
export const DispatcherBoundaryLive = Layer.succeed(DispatcherBoundary, liveBoundary);

/** Tagged failure from a scoped or standalone dispatcher.
 * @example Effect.catchTag(dispatchInvocationEffect(request), "InvocationDispatchFailure", () => Effect.void);
 */
export class InvocationDispatchFailure extends Data.TaggedError("InvocationDispatchFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Reads the active dispatcher through Effect.
 * @returns The active dispatcher or undefined; no expected failure.
 * @example Effect.runSync(currentInvocationDispatcherEffect());
 */
export function currentInvocationDispatcherEffect(): Effect.Effect<
  InvocationDispatcher | undefined
> {
  return observeInvocation(
    "dispatcher.current",
    Effect.flatMap(Effect.serviceOption(DispatcherBoundary), (provided) =>
      Effect.sync(() => (Option.isSome(provided) ? provided.value : liveBoundary).current()),
    ),
  );
}

/** Synchronous active dispatcher compatibility adapter.
 * @returns The active dispatcher or undefined.
 * @example currentInvocationDispatcher();
 */
export function currentInvocationDispatcher(): InvocationDispatcher | undefined {
  return runInvocationSync(currentInvocationDispatcherEffect());
}

/** Dispatches an invocation through a scoped or standalone Effect boundary.
 * @param request - Target, input, and dispatch options.
 * @returns Target output, or `InvocationDispatchFailure` carrying the original cause.
 * @example Effect.runPromise(dispatchInvocationEffect({ target, input }));
 */
export function dispatchInvocationEffect<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(
  request: InvocationDispatchRequest<Input, Output, Context>,
): Effect.Effect<Output, InvocationDispatchFailure> {
  return observeInvocation(
    "dispatcher.dispatch",
    Effect.flatMap(Effect.serviceOption(DispatcherBoundary), (provided) =>
      Effect.suspend(() => {
        let cancel: (() => void) | undefined;
        return Effect.onInterrupt(
          Effect.tryPromise({
            try: (fiberSignal) => {
              const boundary = Option.isSome(provided) ? provided.value : liveBoundary;
              const controller = new AbortController();
              const unlink = linkSignals(controller, [request.options?.signal, fiberSignal]);
              cancel = () => {
                controller.abort(fiberSignal.reason);
                unlink();
              };
              try {
                return Promise.resolve(
                  (boundary.current() ?? boundary.fallback()).dispatch({
                    ...request,
                    options: { ...request.options, signal: controller.signal },
                  }),
                ).finally(unlink);
              } catch (cause) {
                unlink();
                throw cause;
              }
            },
            catch: (cause) =>
              new InvocationDispatchFailure({ cause, message: "Invocation dispatch failed" }),
          }),
          () => Effect.sync(() => cancel?.()),
        );
      }),
    ),
  );
}

/** Promise compatibility adapter for invocation dispatch.
 * @param request - Target, input, and dispatch options.
 * @returns Target output.
 * @throws The original dispatcher failure.
 * @example await dispatchInvocation({ target, input });
 */
export async function dispatchInvocation<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(request: InvocationDispatchRequest<Input, Output, Context>): Promise<Output> {
  try {
    return await Effect.runPromise(dispatchInvocationEffect(request));
  } catch (cause) {
    if (cause instanceof InvocationDispatchFailure) throw cause.cause;
    throw cause;
  }
}

export { currentInvocationScope, runInInvocationScope };
export {
  createStandaloneDispatcher,
  createStandaloneDispatcherEffect,
} from "./standalone-dispatcher.js";
export type {
  InvocationDispatchRequest,
  InvocationDispatcher,
  InvocationDispatchOptions,
  InvocationDispatchScope,
  InvocationValueHooks,
  StandaloneDispatcherOptions,
  TaskAncestry,
} from "./dispatcher.types.js";
export type {
  InvocationContextFactory,
  LocalStructuredLogger,
  StructuredLogRecord,
} from "./dispatcher-context.types.js";
export type {
  ManagedDependencyCategory,
  ManagedDependencySources,
} from "./dispatcher-categories.types.js";
export { MANAGED_DEPENDENCY_CATEGORIES } from "./dispatcher-categories.js";
