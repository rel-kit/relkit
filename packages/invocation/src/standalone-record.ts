import { Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  InvocationIdSource,
  InvocationMetadata,
  InvocationParent,
  InvocationRecord,
  InvocationSource,
  RecordOptions,
} from "./standalone-record.types.js";

/** Tagged invalid timestamp while building a standalone invocation record.
 * @example Effect.catchTag(createStandaloneRecordEffect("task", "direct", {}, "trace", undefined, NaN, ids), "StandaloneRecordError", () => Effect.void);
 */
export class StandaloneRecordError extends Data.TaggedError("StandaloneRecordError")<{
  readonly field: "now" | "deadlineMs" | "startedAt";
  readonly message: string;
}> {}

/** Tagged failure from an injected invocation ID source.
 * @example Effect.catchTag(createStandaloneRecordEffect("task", "direct", {}, "trace", undefined, 0, ids), "StandaloneIdSourceFailure", () => Effect.void);
 */
export class StandaloneIdSourceFailure extends Data.TaggedError("StandaloneIdSourceFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Creates an immutable started record through Effect.
 * @param functionId - Canonical target identifier.
 * @param source - Invocation source.
 * @param options - Correlation and parent metadata.
 * @param traceId - Current trace identifier.
 * @param deadlineMs - Optional absolute deadline.
 * @param now - Current Unix timestamp.
 * @param idSource - Injected ID provider.
 * @param serviceId - Optional service identifier.
 * @returns Started record or tagged timestamp/ID source failure.
 * @example Effect.runSync(createStandaloneRecordEffect("task", "direct", {}, traceId, undefined, 0, ids));
 */
export function createStandaloneRecordEffect(
  functionId: string,
  source: InvocationSource,
  options: RecordOptions,
  traceId: string,
  deadlineMs: number | undefined,
  now: number,
  idSource: InvocationIdSource,
  serviceId?: string,
): Effect.Effect<InvocationRecord, StandaloneRecordError | StandaloneIdSourceFailure> {
  return observeInvocation(
    "standalone.record-create",
    Effect.gen(function* () {
      yield* validDate(now, "now");
      if (deadlineMs !== undefined) yield* validDate(deadlineMs, "deadlineMs");
      const id = yield* Effect.try({
        try: () => idSource.next("invocation"),
        catch: (cause) =>
          new StandaloneIdSourceFailure({ cause, message: "Invocation ID source failed" }),
      });
      const correlationId = options.correlationId ?? options.parent?.correlationId;
      const metadata: InvocationMetadata = {
        id,
        traceId,
        ...(options.parent?.id === undefined ? {} : { parentId: options.parent.id }),
        ...(correlationId === undefined ? {} : { correlationId }),
        startedAt: new Date(now).toISOString(),
        ...(deadlineMs === undefined ? {} : { deadline: new Date(deadlineMs).toISOString() }),
        attempt: 1,
        source,
        ...(serviceId === undefined ? {} : { serviceId }),
      };
      return Object.freeze({ ...metadata, functionId, status: "started" as const });
    }),
  );
}

/** Synchronous started record compatibility adapter.
 * @param functionId - Canonical target identifier.
 * @param source - Invocation source.
 * @param options - Correlation and parent metadata.
 * @param traceId - Current trace identifier.
 * @param deadlineMs - Optional absolute deadline.
 * @param now - Current Unix timestamp.
 * @param idSource - Injected ID provider.
 * @param serviceId - Optional service identifier.
 * @returns An immutable started record.
 * @throws RangeError for invalid timestamps, or the original ID source failure.
 * @example createStandaloneRecord("task", "direct", {}, traceId, undefined, 0, ids);
 */
export function createStandaloneRecord(
  functionId: string,
  source: InvocationSource,
  options: RecordOptions,
  traceId: string,
  deadlineMs: number | undefined,
  now: number,
  idSource: InvocationIdSource,
  serviceId?: string,
): InvocationRecord {
  try {
    return runInvocationSync(
      createStandaloneRecordEffect(
        functionId,
        source,
        options,
        traceId,
        deadlineMs,
        now,
        idSource,
        serviceId,
      ),
    );
  } catch (cause) {
    if (cause instanceof StandaloneRecordError) throw new RangeError(cause.message);
    if (cause instanceof StandaloneIdSourceFailure) throw cause.cause;
    throw cause;
  }
}

/** Completes one immutable invocation record through Effect.
 * @param record - Started invocation record.
 * @param outcome - Final invocation status.
 * @param now - Completion timestamp.
 * @returns A completed record or tagged timestamp failure.
 * @example Effect.runSync(completeStandaloneRecordEffect(record, "success", 100));
 */
export function completeStandaloneRecordEffect(
  record: InvocationRecord,
  outcome: Exclude<InvocationRecord["status"], "started">,
  now: number,
): Effect.Effect<InvocationRecord, StandaloneRecordError> {
  return observeInvocation(
    "standalone.record-complete",
    Effect.gen(function* () {
      yield* validDate(now, "now");
      const started = Date.parse(record.startedAt);
      if (!Number.isFinite(started))
        return yield* Effect.fail(
          new StandaloneRecordError({ field: "startedAt", message: "Invalid record startedAt" }),
        );
      return Object.freeze({
        ...record,
        status: outcome,
        completedAt: new Date(now).toISOString(),
        durationMs: Math.max(0, now - started),
      });
    }),
  );
}

/** Synchronous record completion adapter.
 * @param record - Started invocation record.
 * @param outcome - Final invocation status.
 * @param now - Completion timestamp.
 * @returns A completed immutable record.
 * @throws RangeError for invalid timestamps.
 * @example completeStandaloneRecord(record, "success", 100);
 */
export function completeStandaloneRecord(
  record: InvocationRecord,
  outcome: Exclude<InvocationRecord["status"], "started">,
  now: number,
): InvocationRecord {
  try {
    return runInvocationSync(completeStandaloneRecordEffect(record, outcome, now));
  } catch (cause) {
    if (cause instanceof StandaloneRecordError) throw new RangeError(cause.message);
    throw cause;
  }
}

/** Builds a child invocation parent from a started record.
 * @param record - Started record.
 * @param signal - Current invocation abort signal.
 * @param deadlineMs - Optional inherited absolute deadline.
 * @returns Child parent metadata; no expected Effect failure.
 * @example Effect.runSync(standaloneParentEffect(record, signal, undefined));
 */
export function standaloneParentEffect(
  record: InvocationRecord,
  signal: AbortSignal,
  deadlineMs: number | undefined,
): Effect.Effect<InvocationParent> {
  return observeInvocation(
    "standalone.parent",
    Effect.sync(() => ({
      id: record.id,
      traceId: record.traceId,
      ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
      ...(deadlineMs === undefined ? {} : { deadlineMs }),
      signal,
    })),
  );
}

/** Synchronous child invocation parent adapter.
 * @param record - Started record.
 * @param signal - Current invocation abort signal.
 * @param deadlineMs - Optional inherited absolute deadline.
 * @returns Child parent metadata.
 * @example standaloneParent(record, signal, undefined);
 */
export function standaloneParent(
  record: InvocationRecord,
  signal: AbortSignal,
  deadlineMs: number | undefined,
): InvocationParent {
  return runInvocationSync(standaloneParentEffect(record, signal, deadlineMs));
}
function validDate(
  value: number,
  field: "now" | "deadlineMs",
): Effect.Effect<void, StandaloneRecordError> {
  return Number.isFinite(new Date(value).getTime())
    ? Effect.void
    : Effect.fail(new StandaloneRecordError({ field, message: `Invalid ${field} timestamp` }));
}
