import type { SupervisorDrainCleanupResult } from "./drain-cleanup.types.js";
import type {
  SupervisorDrainFailure,
  SupervisorDrainReport,
  SupervisorDrainResourceResult,
} from "./drain.types.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";

/**
 * Freezes cleanup evidence in public provider order.
 * @param token - Retired generation identity. @param deadlineMs - Configured shared budget.
 * @param elapsedMs - Observed elapsed time. @param initialInFlight - Work present at admission close.
 * @param remaining - Work still unacknowledged. @param interrupted - Native cancellation count.
 * @param timedOut - Whether the idle deadline expired. @param candidate - Candidate cleanup evidence.
 * @param providers - Reverse cleanup order, copied into public registration order.
 * @param failures - Bounded cleanup messages. @returns An immutable compatibility report.
 */
export function drainReport(
  token: SupervisorCandidateToken,
  deadlineMs: number,
  elapsedMs: number,
  initialInFlight: number,
  remaining: number,
  interrupted: number,
  timedOut: boolean,
  candidate: SupervisorDrainCleanupResult,
  providers: readonly SupervisorDrainResourceResult[],
  failures: readonly SupervisorDrainFailure[],
): SupervisorDrainReport {
  const expired =
    timedOut ||
    remaining > 0 ||
    candidate.status === "timed-out" ||
    providers.some((item) => item.status === "timed-out");
  return Object.freeze({
    token,
    deadlineMs,
    elapsedMs: Math.max(0, elapsedMs),
    initialInFlight,
    completed: initialInFlight - remaining,
    interrupted,
    remaining,
    timedOut: expired,
    outcome: expired
      ? "timed-out"
      : failures.length > 0
        ? "failed"
        : interrupted > 0
          ? "interrupted"
          : "drained",
    candidate: candidate.status,
    providers: Object.freeze([...providers].reverse()),
    failures: Object.freeze([...failures]),
    stateTransition: "not-configured",
  });
}
