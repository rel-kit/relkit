/**
 * Checks only the process group created by one measured command. Leader exit
 * does not prove web/inspector children have released. Graceful cleanup joins
 * group disappearance; forced termination remains a failed acceptance receipt.
 */
import { Effect, Schedule } from "effect";
import { ReadinessBenchmarkError } from "./benchmark-error.js";

/**
 * Joins group disappearance within a finite graceful-shutdown deadline.
 * @param pid - Leader of the freshly detached group owned by this measurement.
 * @returns Completion or typed rejection after forcing remaining owned children.
 */
export const joinBenchmarkGroup = Effect.fn("ReadinessBenchmark.joinGroup")(function* (
  pid: number | undefined,
) {
  if (pid === undefined || process.platform === "win32") return;
  const absent = yield* Effect.try({
    try: () => !groupExists(pid),
    catch: (cause) => groupFailure("group.observe", cause),
  }).pipe(
    Effect.repeat({ schedule: Schedule.spaced(5), until: (value) => value }),
    Effect.timeoutOption(5_000),
  );
  if (absent._tag === "Some") return;
  yield* Effect.try({
    try: () => process.kill(-pid, "SIGKILL"),
    catch: (cause) => groupFailure("group.force", cause),
  });
  yield* Effect.try({
    try: () => !groupExists(pid),
    catch: (cause) => groupFailure("group.observe", cause),
  }).pipe(
    Effect.repeat({ schedule: Schedule.spaced(5), until: (value) => value }),
    Effect.timeoutOption(1_000),
  );
  return yield* groupFailure("group.drain", new Error("Owned process group required SIGKILL"));
});

/**
 * Distinguishes group absence from denied observation or other native errors.
 * @param pid - Exact measurement-owned process group leader identity.
 * @returns Whether at least one process still belongs to the group.
 */
function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ESRCH") return false;
    throw cause;
  }
}

/**
 * Wraps native cleanup failure without exposing retained command environment.
 * @typeParam T - Native failure inferred at its boundary.
 * @param operation - Fixed process-group observation or release context.
 * @param cause - Original native cleanup evidence.
 * @returns Typed benchmark failure that cannot certify an otherwise correct response.
 */
function groupFailure<T>(operation: string, cause: T) {
  return new ReadinessBenchmarkError({
    operation,
    cause: new Error("Readiness process-group cleanup failed", { cause }),
  });
}
