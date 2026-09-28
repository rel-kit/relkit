import type { JobEnqueueResult } from "@relkit/functions";
import { Effect, Result } from "effect";
import { ClientUtilityFailure } from "./client-utils-error.js";
import {
  normalizeResultValue,
  notifyValue,
  resolveCorrelationValue,
} from "./client-utils-value.js";
import { observeJobs } from "./jobs-observability.js";
import type { JobClientOptions, JobProviderResult } from "./client.types.js";
/** Normalizes a provider receipt in Effect.
 * @param value - Provider receipt or void.
 * @param profile - Selected profile.
 * @param correlationId - Optional request correlation.
 * @returns Accepted result or ClientUtilityFailure.
 * @example Effect.runSync(normalizeResultEffect(receipt, "default", undefined));
 */
export const normalizeResultEffect = Effect.fn("Jobs.normalizeClientResult")(
  (value: JobProviderResult | undefined, profile: string, correlationId: string | undefined) =>
    observeJobs(
      "client.normalizeResult",
      Effect.try({
        try: () => normalizeResultValue(value, profile, correlationId),
        catch: (cause) => new ClientUtilityFailure({ cause }),
      }),
    ),
);
/** Synchronous provider receipt normalizer.
 * @param value - Provider receipt or void.
 * @param profile - Selected profile.
 * @param correlationId - Optional request correlation.
 * @returns Accepted result.
 * @throws Original normalization error.
 * @example normalizeResult(receipt, "default", undefined);
 */
export function normalizeResult(
  value: JobProviderResult | undefined,
  profile: string,
  correlationId: string | undefined,
): JobEnqueueResult {
  const result = Effect.runSync(
    Effect.result(normalizeResultEffect(value, profile, correlationId)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Delivers a client edge hook without changing enqueue outcome in Effect.
 * @param hook - Optional edge hook.
 * @param value - Frozen event payload.
 * @param enabled - Whether notification is enabled.
 * @returns Void; hook errors are intentionally ignored.
 * @example Effect.runSync(notifyEffect(onEdge, edge));
 */
export const notifyEffect = Effect.fn("Jobs.notifyClientHook")(
  <T>(hook: ((value: T) => void) | undefined, value: T, enabled = true) =>
    observeJobs(
      "client.notify",
      Effect.sync(() => notifyValue(hook, value, enabled)),
    ),
);
/** Synchronous client edge hook notification.
 * @param hook - Optional edge hook.
 * @param value - Frozen event payload.
 * @param enabled - Whether notification is enabled.
 * @returns Void; hook errors are intentionally ignored.
 * @example notify(onEdge, edge);
 */
export function notify<T>(hook: ((value: T) => void) | undefined, value: T, enabled = true): void {
  Effect.runSync(notifyEffect(hook, value, enabled));
}
/** Resolves a configured correlation id in Effect.
 * @param value - Text or lazy correlation provider.
 * @returns Correlation id or ClientUtilityFailure.
 * @example Effect.runSync(resolveCorrelationEffect(() => "request"));
 */
export const resolveCorrelationEffect = Effect.fn("Jobs.resolveClientCorrelation")(
  (value: JobClientOptions["correlationId"]) =>
    observeJobs(
      "client.resolveCorrelation",
      Effect.try({
        try: () => resolveCorrelationValue(value),
        catch: (cause) => new ClientUtilityFailure({ cause }),
      }),
    ),
);
/** Synchronous correlation id resolver.
 * @param value - Text or lazy correlation provider.
 * @returns Correlation id when available.
 * @throws Original callback error.
 * @example resolveCorrelation(() => "request");
 */
export function resolveCorrelation(value: JobClientOptions["correlationId"]): string | undefined {
  const result = Effect.runSync(Effect.result(resolveCorrelationEffect(value)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
