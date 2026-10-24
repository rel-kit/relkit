/** Builds the original 102-span native trace fixture plus summary and request-only trace using plain observability record DTOs. */
import type { LocalRecord } from "@relkit/observability/local/record";

/** Builds all original records before the native worker is invoked.
 * @param startedAt - One real timestamp shared by the complete fixture.
 * @returns Complete original append batch, retaining both trace identities.
 */
export function tracePageRecords(startedAt: string): LocalRecord[] {
  return [
    ...Array.from({ length: 102 }, (_, index) => spanRecord(index, startedAt)),
    summaryRecord(startedAt),
    requestRecord(startedAt),
  ];
}

/** Builds one retained span with its original stable identity.
 * @param index - Zero-based span position in the original batch.
 * @param startedAt - Timestamp shared by its trace.
 * @returns Native completed application span.
 */
function spanRecord(index: number, startedAt: string): LocalRecord {
  return {
    key: `span:${index}`,
    origin: "application",
    record: {
      version: 2,
      signal: "span",
      traceId: "30000000000000000000000000000003",
      spanId: (index + 1).toString(16).padStart(16, "0"),
      invocationId: `invocation:${index}`,
      name: "work",
      kind: "internal",
      status: "completed",
      revision: 1,
      startedAt,
    },
  };
}

/** Builds the original latest summary with its complete retained-span count.
 * @param startedAt - Timestamp shared by the 102 original spans.
 * @returns Native trace summary for the first trace.
 */
function summaryRecord(startedAt: string): LocalRecord {
  return {
    key: "summary",
    origin: "application",
    record: {
      version: 2,
      signal: "trace",
      traceId: "30000000000000000000000000000003",
      startedAt,
      spanCount: 102,
    },
  };
}

/** Builds the original separate trace represented only by a native request record.
 * @param startedAt - Timestamp shared by the complete append batch.
 * @returns Native completed request retaining every original routing and outcome field.
 */
function requestRecord(startedAt: string): LocalRecord {
  return {
    key: "request-only",
    origin: "application",
    record: {
      version: 2,
      signal: "request",
      phase: "completed",
      requestId: "request-only",
      originRequestId: "request-only",
      traceId: "40000000000000000000000000000004",
      invocationId: "request-only",
      generationId: "g1",
      graphHash: "hash",
      method: "GET",
      rawPath: "/missing",
      normalizedRoute: "unknown",
      routeId: "unknown",
      functionId: "unknown",
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      status: 404,
      outcome: "success",
    },
  };
}
