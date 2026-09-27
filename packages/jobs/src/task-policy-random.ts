import { Context, Effect, Layer, Option } from "effect";
import type { NormalizedTaskRetryPolicy } from "./task-types.js";
import { retryDelayMillis as retryDelayValue } from "./task-policy-value.js";
import { runTaskValidation, taskValidationEffect } from "./task-validation-run.js";
/** Substitutable random sample source for retry jitter.
 * @example const service = yield* TaskPolicyRandom;
 */
export class TaskPolicyRandom extends Context.Service<
  TaskPolicyRandom,
  { readonly sample: () => number }
>()("relkit/jobs/TaskPolicyRandom") {}
/** Provides deterministic retry jitter samples.
 * @param sample - Random sample callback in [0, 1].
 * @returns A Layer for retryDelayMillisEffect.
 * @example taskPolicyRandomLayer(() => 0.5);
 */
export const taskPolicyRandomLayer = (sample: () => number) =>
  Layer.succeed(TaskPolicyRandom, { sample });
/** Computes bounded retry delay in Effect using an injectable sample source.
 * @param policy - Normalized retry policy.
 * @param attempt - One-based attempt number.
 * @param retryAfterMillis - Minimum provider retry delay.
 * @param random - Optional per-call sample callback.
 * @returns Delay in milliseconds or TaskValidationFailure.
 * @example Effect.runSync(Effect.provide(retryDelayMillisEffect(policy, 2), taskPolicyRandomLayer(() => 0.5)));
 */
export const retryDelayMillisEffect = Effect.fn("Jobs.retryTaskDelay")(
  (
    policy: NormalizedTaskRetryPolicy,
    attempt: number,
    retryAfterMillis = 0,
    random?: () => number,
  ) =>
    Effect.flatMap(Effect.serviceOption(TaskPolicyRandom), (service) =>
      taskValidationEffect("taskPolicy.retryDelay", () =>
        retryDelayValue(
          policy,
          attempt,
          retryAfterMillis,
          random ?? (Option.isSome(service) ? service.value.sample : Math.random),
        ),
      ),
    ),
);
/** Synchronous bounded retry delay calculator.
 * @param policy - Normalized retry policy.
 * @param attempt - One-based attempt number.
 * @param retryAfterMillis - Minimum provider retry delay.
 * @param random - Optional deterministic sample callback.
 * @returns Delay in milliseconds.
 * @throws TypeError for invalid attempts or samples.
 * @example retryDelayMillis(policy, 2, 0, () => 0.5);
 */
export function retryDelayMillis(
  policy: NormalizedTaskRetryPolicy,
  attempt: number,
  retryAfterMillis = 0,
  random = Math.random,
): number {
  return runTaskValidation(retryDelayMillisEffect(policy, attempt, retryAfterMillis, random));
}
