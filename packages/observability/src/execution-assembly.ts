import { Effect } from "effect";
import type { ObservabilityRecord, SpanRecord, TraceRecord } from "./model.js";
import type { RequestExecutionDetail } from "./execution-assembly.types.js";
import {
  assembleRequestExecutionEffect,
  coalesceSpansEffect,
  currentTraceEffect,
} from "./execution-assembly-effect.js";
export type { RequestExecutionDetail, SpanNode } from "./execution-assembly.types.js";
export {
  MAX_EXECUTION_RECORDS,
  MAX_CONTINUATION_TRACES,
  MAX_EXECUTION_DEPTH,
} from "./execution-assembly-core.js";
export {
  assembleRequestExecutionEffect,
  coalesceSpansEffect,
  currentTraceEffect,
} from "./execution-assembly-effect.js";
/**
 * Assembles bounded execution detail for one request identity.
 * @param records - Candidate execution records.
 * @param requestId - Request identity.
 * @returns Immutable detail, or undefined when absent.
 * @example
 * const detail = assembleRequestExecution(records, "request-1");
 */
export function assembleRequestExecution(
  records: readonly ObservabilityRecord[],
  requestId: string,
): RequestExecutionDetail | undefined {
  return Effect.runSync(assembleRequestExecutionEffect(records, requestId));
}
/**
 * Keeps the latest lifecycle revision for each span identity.
 * @param spans - Span lifecycle records.
 * @returns Current spans ordered by start time.
 * @example
 * const current = coalesceSpans(spanRecords);
 */
export function coalesceSpans(spans: readonly SpanRecord[]): SpanRecord[] {
  return Effect.runSync(coalesceSpansEffect(spans));
}
/**
 * Combines current spans with the most recent trace record.
 * @param spans - Span lifecycle records.
 * @param traces - Trace records in chronological order.
 * @returns Current spans and optional latest trace.
 * @example
 * const current = currentTrace(spans, traces);
 */
export function currentTrace(spans: readonly SpanRecord[], traces: readonly TraceRecord[] = []) {
  return Effect.runSync(currentTraceEffect(spans, traces));
}
