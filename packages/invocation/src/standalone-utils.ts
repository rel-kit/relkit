import type {
  InvocationIdSource,
  InvocationMetadata,
  InvocationParent,
  InvocationRecord,
  InvocationSource,
} from "./contracts.js";
import type { InvocationDispatchOptions } from "./dispatcher-types.js";

type DeadlineOptions = Pick<InvocationDispatchOptions, "deadlineMs" | "timeoutMs">;
type RecordOptions = Pick<InvocationDispatchOptions, "correlationId" | "parent">;

export function calculateStandaloneDeadline(
  targetTimeout: number | undefined,
  options: DeadlineOptions,
  parent: InvocationParent | undefined,
  now: number,
): number | undefined {
  const timeouts = [targetTimeout, options.timeoutMs].filter(
    (value): value is number => value !== undefined,
  );
  for (const timeout of timeouts) {
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new RangeError("timeoutMs must be finite and non-negative");
    }
  }
  const deadlines = [parent?.deadlineMs, options.deadlineMs];
  if (timeouts.length > 0) deadlines.push(now + Math.min(...timeouts));
  for (const deadline of deadlines) {
    if (deadline !== undefined && !Number.isFinite(deadline)) {
      throw new RangeError("deadline must be a finite timestamp");
    }
  }
  return deadlines
    .filter((value): value is number => value !== undefined)
    .reduce<number | undefined>(
      (minimum, value) => (minimum === undefined ? value : Math.min(minimum, value)),
      undefined,
    );
}

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
  const correlationId = options.correlationId ?? options.parent?.correlationId;
  const metadata: InvocationMetadata = {
    id: idSource.next("invocation"),
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
}

export function completeStandaloneRecord(
  record: InvocationRecord,
  outcome: Exclude<InvocationRecord["status"], "started">,
  now: number,
): InvocationRecord {
  return Object.freeze({
    ...record,
    status: outcome,
    completedAt: new Date(now).toISOString(),
    durationMs: Math.max(0, now - Date.parse(record.startedAt)),
  });
}

export function standaloneParent(
  record: InvocationRecord,
  signal: AbortSignal,
  deadlineMs: number | undefined,
): InvocationParent {
  return {
    id: record.id,
    traceId: record.traceId,
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
    signal,
  };
}
