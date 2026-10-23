/** Asserts original query, detail and cursor observations from the actual native worker; no synthetic pages or fallback records are supplied. */
import { expect } from "@effect/vitest";
import { Effect } from "effect";
import type { StoredLocalRecord } from "@relkit/observability/local/record";
import type { ObservabilityQueryPage } from "@relkit/observability";
import type {
  RequestOnlyTraceDetail,
  TracePageDetail,
  TracePageWorker,
} from "./local-trace-pages.types.js";

/** Checks all original native trace assertions after the complete batch is appended.
 * @param worker - Original live worker whose ownership remains in the caller's test Scope.
 * @returns Completion after both original trace details and the final real page are observed.
 */
export const verifyTracePages = Effect.fn("TracePagesTest.verify")(function* (
  worker: TracePageWorker,
) {
  const traces = yield* Effect.promise(() =>
    worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "traces",
      query: { limit: 100 },
    }),
  );
  expect(traces.items).toHaveLength(2);
  expect(new Set(traces.items.map((record) => record.traceId)).size).toBe(2);
  const detail = yield* Effect.promise(() =>
    worker.call<TracePageDetail>({
      type: "detail",
      kind: "trace",
      id: "30000000000000000000000000000003",
    }),
  );
  expect(detail.trace.spanCount).toBe(102);
  const requestOnly = yield* Effect.promise(() =>
    worker.call<RequestOnlyTraceDetail>({
      type: "detail",
      kind: "trace",
      id: "40000000000000000000000000000004",
    }),
  );
  expect(requestOnly.spans).toEqual([]);
  expect(requestOnly.records[0]?.signal).toBe("request");
  expect(detail.spans).toHaveLength(100);
  const rest = yield* Effect.promise(() =>
    worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "traces",
      query: { traceId: "30000000000000000000000000000003", cursor: detail.nextCursor },
    }),
  );
  expect(rest.nextCursor).toBeUndefined();
  expect(
    new Set(
      [...detail.spans, ...rest.items.filter((record) => record.signal === "span")].map(
        (record) => record.cursor,
      ),
    ).size,
  ).toBe(102);
});
