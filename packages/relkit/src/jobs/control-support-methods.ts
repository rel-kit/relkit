import type { OperationContext } from "./adapter.js";
import type { JobsRuntime } from "./runtime.js";
import { Effect } from "effect";
import {
  operationContext as contextValue,
  requireMethod as methodValue,
  requireOperationId as operationIdValue,
} from "./control-support-value.js";
import { controlSupportEffect, runControlSupport } from "./control-support-run.js";
/** Creates a native operation context in Effect.
 * @param runtime - Jobs runtime.
 * @param signal - Optional cancellation signal.
 * @param operationId - Optional stable operation identity.
 * @returns Operation context or ControlSupportFailure.
 * @example Effect.runSync(operationContextEffect(runtime, undefined));
 */
export const operationContextEffect = Effect.fn("Jobs.controlOperationContext")(
  (runtime: JobsRuntime, signal: AbortSignal | undefined, operationId?: string) =>
    controlSupportEffect("controlSupport.context", () =>
      contextValue(runtime, signal, operationId),
    ),
);
/** Synchronous native operation context creator.
 * @param runtime - Jobs runtime.
 * @param signal - Optional cancellation signal.
 * @param operationId - Optional stable operation identity.
 * @returns Operation context.
 * @throws Original runtime context error.
 * @example operationContext(runtime, undefined);
 */
export function operationContext(
  runtime: JobsRuntime,
  signal: AbortSignal | undefined,
  operationId?: string,
): OperationContext {
  return runControlSupport(operationContextEffect(runtime, signal, operationId));
}
/** Requires a native adapter method and capability in Effect.
 * @param runtime - Jobs runtime.
 * @param capability - Required feature name.
 * @param method - Adapter method name.
 * @returns Void or ControlSupportFailure.
 * @example Effect.runSync(requireMethodEffect(runtime, "read", "get"));
 */
export const requireMethodEffect = Effect.fn("Jobs.requireControlMethod")(
  (runtime: JobsRuntime, capability: string, method: keyof JobsRuntime["adapter"]) =>
    controlSupportEffect("controlSupport.requireMethod", () =>
      methodValue(runtime, capability, method),
    ),
);
/** Synchronous native method and capability assertion.
 * @param runtime - Jobs runtime.
 * @param capability - Required feature name.
 * @param method - Adapter method name.
 * @returns Nothing when available.
 * @throws JobsCapabilityError when unavailable.
 * @example requireMethod(runtime, "read", "get");
 */
export function requireMethod(
  runtime: JobsRuntime,
  capability: string,
  method: keyof JobsRuntime["adapter"],
): void {
  runControlSupport(requireMethodEffect(runtime, capability, method));
}
/** Validates a bounded control operation ID in Effect.
 * @param value - Candidate operation identity.
 * @returns Void or ControlSupportFailure.
 * @example Effect.runSync(requireOperationIdEffect("cancel-1"));
 */
export const requireOperationIdEffect = Effect.fn("Jobs.requireControlOperationId")(
  (value: string) =>
    controlSupportEffect("controlSupport.operationId", () => operationIdValue(value)),
);
/** Synchronous bounded control operation ID assertion.
 * @param value - Candidate operation identity.
 * @returns Nothing when valid.
 * @throws TypeError when missing or too long.
 * @example requireOperationId("cancel-1");
 */
export function requireOperationId(value: string): void {
  runControlSupport(requireOperationIdEffect(value));
}
