import { nativeNow } from "../native-services.js";
import type { JobErrorEnvelope } from "../../contracts/jobs.js";
import { durationToMillis } from "../../jobs/index.js";
import type { LocalNativeRun, LocalRunLimit } from "./native-adapter-types.js";

/** Failure code the engine reports when an attempt reaches its deadline. */
export const TIMEOUT_CODE = "RELKIT_TIMEOUT" as const;

/** Timer granularity allowed between the deadline and the instant its failure is settled. */
const TIMER_TOLERANCE_MS = 5;

/** Reads one task limit of a run from its submitted policy.
 * @param run - Current persisted native run.
 * @param name - Limit to read.
 * @returns The limit in milliseconds, or undefined when the task declares none.
 */
function limitMillis(run: LocalNativeRun, name: LocalRunLimit["name"]): number | undefined {
  const policy: unknown = run.request.policy;
  const value =
    policy !== null && typeof policy === "object"
      ? (policy as Record<string, unknown>)[name]
      : undefined;
  if (typeof value !== "string") return undefined;
  try {
    return durationToMillis(value as never);
  } catch {
    return undefined;
  }
}

/** Calculates the instant fixed at acceptance after which the run may not continue.
 * @param run - Current persisted native run.
 * @returns The `maxElapsed` deadline in epoch milliseconds, or undefined without the limit.
 */
function elapsedDeadline(run: LocalNativeRun): number | undefined {
  const limit = limitMillis(run, "maxElapsed");
  return limit === undefined ? undefined : Date.parse(run.acceptedAt) + limit;
}

/** Checks whether the run has used its whole `maxElapsed` time.
 * @param run - Current persisted native run.
 * @returns Whether the limit is declared and its deadline has passed.
 */
export function pastElapsed(run: LocalNativeRun): boolean {
  const deadline = elapsedDeadline(run);
  return deadline !== undefined && deadline <= nativeNow();
}

/** Chooses the limit that stops the attempt being started, counting active time already used.
 * @param run - Current persisted native run, about to start or resume an attempt.
 * @returns The earlier of the two deadlines with its name, or undefined without limits.
 */
export function attemptLimit(run: LocalNativeRun): LocalRunLimit | undefined {
  const duration = limitMillis(run, "maxDuration");
  const elapsed = elapsedDeadline(run);
  const active =
    duration === undefined ? undefined : nativeNow() + Math.max(0, duration - (run.activeMs ?? 0));
  if (active === undefined)
    return elapsed === undefined ? undefined : { name: "maxElapsed", at: elapsed };
  return elapsed !== undefined && elapsed <= active
    ? { name: "maxElapsed", at: elapsed }
    : { name: "maxDuration", at: active };
}

/** Adds the time worked since the attempt last started, before the run goes to sleep.
 * @param run - Current persisted native run, still marked as started.
 * @returns Nothing; the run's active time is updated in place.
 */
export function recordActiveTime(run: LocalNativeRun): void {
  if (run.startedAt === undefined) return;
  run.activeMs = (run.activeMs ?? 0) + Math.max(0, nativeNow() - Date.parse(run.startedAt));
}

/** Names the limit a failed attempt reached, when its failure is the deadline's.
 * @param run - Current persisted native run.
 * @param failure - Normalized failure of the attempt.
 * @returns The limit that stopped the attempt, or undefined for any other failure.
 */
export function reachedLimit(
  run: LocalNativeRun,
  failure: JobErrorEnvelope,
): LocalRunLimit["name"] | undefined {
  if (failure.code !== TIMEOUT_CODE || run.limit === undefined) return undefined;
  return nativeNow() >= run.limit.at - TIMER_TOLERANCE_MS ? run.limit.name : undefined;
}

/** Builds the public error of a run stopped by a limit.
 * @param run - Current persisted native run.
 * @param name - Limit the run reached.
 * @returns The timeout error naming the task, the limit and its declared value.
 */
export function limitError(run: LocalNativeRun, name: LocalRunLimit["name"]): JobErrorEnvelope {
  const declared = (run.request.policy as Record<string, unknown>)[name];
  return {
    code: TIMEOUT_CODE,
    message: `Task "${run.request.taskId}" exceeded ${name} of ${String(declared)}`,
    retry: "never",
  };
}
