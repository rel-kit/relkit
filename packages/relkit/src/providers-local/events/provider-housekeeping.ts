/**
 * Keeps the local event provider's housekeeping out of application telemetry. The delivery poll
 * runs every 100 ms and inspection queries read every stored delivery; both are framework work,
 * so their successful provider operations record no completion log (metrics, spans and failure
 * logs remain). Delivered handlers are application work: their invocation gets back the success
 * log policy that was in effect when the provider opened, so the quiet poll never leaks into the
 * function a delivery runs.
 */
import { Cause, Context, Effect, Exit } from "effect";
import { ExecutionSuccessLogs } from "../../contracts/operation.js";
import { currentNativeEffectContext, withNativeEffectContext } from "../../runtime-effect/index.js";
import type { EventRouterTrigger } from "./router-types.js";

/**
 * Runs provider housekeeping without success completion logs.
 * @typeParam A - Success value.
 * @typeParam E - Typed failures, which still log.
 * @typeParam R - Required services.
 * @param effect - Polling or inspection work of the local event provider.
 * @returns The same lazy effect with `ExecutionSuccessLogs` disabled for it and its children.
 */
export function housekeeping<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return Effect.provideService(effect, ExecutionSuccessLogs, false);
}

/**
 * Restores the application's success log policy around a trigger's delivered handler.
 * @param binding - Registered trigger whose handler runs inside the quiet poll.
 * @param successLogs - Policy in effect when the provider opened.
 * @returns The binding with a handler that runs under that policy.
 */
export function withApplicationSuccessLogs(
  binding: EventRouterTrigger,
  successLogs: boolean,
): EventRouterTrigger {
  const invoke: EventRouterTrigger["invoke"] = async (envelope, options) => {
    const current = currentNativeEffectContext();
    // Without a native context the handler already runs under the default policy.
    if (current === undefined) return binding.invoke(envelope, options);
    const context = Context.add(current, ExecutionSuccessLogs, successLogs);
    // A handler reads the policy from the current fiber before its first await and from the
    // native store after it, so the handler starts in its own fiber holding the restored policy.
    const exit = await Effect.runPromiseExitWith(context)(
      Effect.promise(() =>
        withNativeEffectContext(context, () => binding.invoke(envelope, options)),
      ),
    );
    if (Exit.isSuccess(exit)) return exit.value;
    // A rejection is a defect of this adapter fiber; squash returns the handler's own error.
    throw Cause.squash(exit.cause);
  };
  return Object.freeze({ ...binding, invoke });
}
