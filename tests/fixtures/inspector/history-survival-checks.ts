/** The expectations on {@link HistorySurvivalResult}, shared by the Node and the Bun test. */
import type { HistorySurvivalResult } from "./history-survival-run.js";

const NO_LOSS = { byApplicationProducer: 0, byInspectionBuffer: 0, byHistoryStore: 0 };

/**
 * Lists what went wrong in a run.
 * @param result - What the run observed.
 * @returns One sentence per broken expectation; empty when history survived every step.
 */
export function historySurvivalFailures(result: HistorySurvivalResult): string[] {
  const failures: string[] = [];
  const check = (ok: boolean, sentence: string) => {
    if (!ok) failures.push(`${sentence}: ${JSON.stringify(result)}`);
  };
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  check(
    result.afterPoison.state === "ready" && result.afterPoison.incomplete === false,
    "a record with an unpaired surrogate left history degraded or incomplete",
  );
  check(result.poisonStored, "the request with an unpaired surrogate is not in history");
  check(same(result.afterPoison.recordsLostBeforeHistory, NO_LOSS), "records were lost");
  check(
    result.secondStatus.state === "degraded",
    "the second Inspector did not say it has no history",
  );
  check(result.workerBeforeSecond.length === 1, "the first Inspector had no single worker");
  check(
    same(result.workerAfterSecond, result.workerBeforeSecond),
    "the first Inspector's worker changed while a second Inspector started and stopped",
  );
  check(result.ownerUnchanged, "the owner file changed");
  check(
    result.collectedWhileSecondRan && result.collectedAfterSecondStopped,
    "the first Inspector stopped collecting",
  );
  check(
    result.afterKill.state === "degraded" && result.afterKill.error === "history.worker-exited",
    "a killed worker was not reported as history unavailable with its reason",
  );
  check(result.msUntilReported < 2000, "the killed worker was reported late");
  check(
    result.workerAfterRestart.length === 1 &&
      result.workerAfterRestart[0] !== result.workerAfterSecond[0],
    "no new worker was started",
  );
  check(
    result.afterRestart.incomplete === false &&
      same(result.afterRestart.recordsLostBeforeHistory, NO_LOSS),
    "the worker restart lost records",
  );
  check(result.sentDuringGapStored, "a request sent while the worker was away is not in history");
  check(
    result.applicationDown.state === "ready" && result.applicationDown.error === undefined,
    "an application outage was reported as a history failure",
  );
  return failures;
}
