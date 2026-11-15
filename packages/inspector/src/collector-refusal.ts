/**
 * Keeps one record the history store refuses from stopping collection. The store refuses a batch
 * as a whole, so a batch it refuses is stored again one record at a time; only the records it
 * still refuses are given up, and only after the store has proved that it stores by keeping a
 * diagnostic that names them. A failure of the store itself gives up nothing.
 */
import { Effect } from "effect";
import type { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { LocalRecord } from "relkit/observability/local/record";
import { LocalWorkerError } from "relkit/observability/local/worker-contract";
import type { InspectorHistoryOperations } from "./history.types.js";

/**
 * Whether the worker answered that it refused the records, as opposed to failing itself.
 * @param error - A failed history command.
 * @returns True for a refusal: the worker is alive and rolled the batch back.
 */
export function refusedByStore(error: InspectionConnectionError): boolean {
  return (
    error.cause instanceof LocalWorkerError &&
    error.cause.reason === "response" &&
    error.cause.code === undefined
  );
}

/**
 * Appends a batch; when the store refuses it, appends its records one by one.
 * @param history - Open history.
 * @param records - The batch, as collected.
 * @param sessionId - Application session the batch belongs to.
 * @returns How many records the store refused and this Inspector gave up; zero when all were
 *   stored. Fails, giving up nothing, when the store fails rather than refuses.
 */
export const appendCollected = Effect.fn("Inspector.appendCollected")(function* (
  history: InspectorHistoryOperations,
  records: readonly LocalRecord[],
  sessionId: string,
) {
  const whole = yield* Effect.result(history.call({ type: "append", records: [...records] }));
  if (whole._tag === "Success") return 0;
  const failure = whole.failure;
  if (!refusedByStore(failure)) return yield* Effect.fail(failure);
  const refused: LocalRecord[] = [];
  for (const record of records) {
    const one = yield* Effect.result(history.call({ type: "append", records: [record] }));
    if (one._tag === "Success") continue;
    if (!refusedByStore(one.failure)) return yield* Effect.fail(one.failure);
    refused.push(record);
  }
  if (refused.length === 0) return 0;
  // Stores the reason beside the history; when even this fails, the store is not working.
  yield* history
    .call({ type: "append", records: [refusalDiagnostic(sessionId, refused)] })
    .pipe(Effect.mapError(() => failure));
  return refused.length;
});

/** A diagnostic naming the refused records by signal; a replayed batch reuses its key. */
function refusalDiagnostic(sessionId: string, refused: readonly LocalRecord[]): LocalRecord {
  const signals = new Map<string, number>();
  for (const { record } of refused) signals.set(record.signal, (signals.get(record.signal) ?? 0) + 1);
  const named = [...signals].map(([signal, count]) => `${count} ${signal}`).join(", ");
  return {
    key: `${sessionId}:refused:${refused[0]!.key}`,
    origin: "inspector",
    record: {
      version: 2,
      signal: "diagnostic",
      code: "RELKIT_INSPECTION_INCOMPLETE",
      severity: "warning",
      occurredAt: new Date().toISOString(),
      message: `Inspection is incomplete: the history store refused ${refused.length} records (${named}), so they are not in history.`,
    },
  };
}
