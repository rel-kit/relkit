/**
 * Bridges native callbacks through the current Effect context and generation signal.
 * Original rejection identity remains intact at the generated host Promise boundary.
 */
import { Context, Effect } from "effect";
import { ExecutionSuccessLogs, runExecutionPromise } from "@relkit/contracts/operation";
import { currentNativeEffectContext, withNativeEffectContext } from "@relkit/runtime-effect";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeHostState } from "./runtime-host-state.types.js";

/** @typeParam A - Native callback result. @param owner - Host generation authority. @param operation - Fixed identity. @param callback - Signal-aware native work. @returns Lazy interruptible callback with typed failure. */
export function externalRuntimeCallback<A>(
  owner: RuntimeHostState,
  operation: string,
  callback: (signal: AbortSignal) => Promise<A>,
) {
  return Effect.withFiber((fiber) =>
    Effect.tryPromise({
      try: (signal) =>
        withNativeEffectContext(fiber.context, () =>
          callback(AbortSignal.any([signal, owner.environment.controller.signal])),
        ),
      catch: (cause) => new ServerRuntimeFailure({ operation, cause }),
    }),
  );
}

/** @typeParam A - Native result. @param owner - Acquired managed graph. @param effect - Fully provided lifecycle operation. @returns Its native result or original callback rejection. */
export function runRuntimeHost<A>(
  owner: RuntimeHostState,
  effect: Effect.Effect<A, ServerRuntimeFailure>,
): Promise<A> {
  return runExecutionPromise(
    owner.runtime,
    effect.pipe(
      Effect.provideService(
        ExecutionSuccessLogs,
        Context.get(currentNativeEffectContext() ?? Context.empty(), ExecutionSuccessLogs),
      ),
    ),
  ).catch((failure) => {
    throw failure instanceof ServerRuntimeFailure ? failure.cause : failure;
  });
}

/** @typeParam A - Native pass result. @param owner - Host generation. @param pass - Starts physical native work once. @returns Its tracked original completion result. */
export function trackRuntimeHostCallback<A>(
  owner: RuntimeHostState,
  pass: () => Promise<A>,
): Promise<A> {
  return runRuntimeHost(owner, owner.service.track(pass()));
}
