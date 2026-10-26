/** Describes the original native trace-detail fields exercised by pagination and request-only acceptance. */
import type { StoredLocalRecord } from "@relkit/observability/local/record";
import type { startLocalWorker } from "../src/local/worker-client.js";

/** Exact native worker facade exercised by the original public Promise API. */
export type TracePageWorker = ReturnType<typeof startLocalWorker>;

/** Native detail for the original trace whose 102 spans require a second page. */
export interface TracePageDetail {
  /** Actual latest summary observed from the native worker. */
  readonly trace: { readonly spanCount: number };
  /** Actual first page of retained native spans. */
  readonly spans: StoredLocalRecord[];
  /** Actual continuation cursor returned for this deliberately oversized trace. */
  readonly nextCursor: string;
}

/** Native detail for the original trace represented by a request and no spans. */
export interface RequestOnlyTraceDetail {
  /** Actual empty span list, asserted without a synthetic fallback. */
  readonly spans: StoredLocalRecord[];
  /** Original native request records belonging to the separate trace. */
  readonly records: StoredLocalRecord[];
}
