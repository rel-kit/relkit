import type { ObservabilityRecord, RequestRecord, SpanRecord } from "./model.js";

/** One span and its bounded descendant tree. */
export interface SpanNode {
  readonly span: SpanRecord;
  readonly children: readonly SpanNode[];
}

/** Bounded request, span, and continuation view assembled for inspection. */
export interface RequestExecutionDetail {
  readonly request: RequestRecord;
  readonly spans: readonly SpanRecord[];
  readonly roots: readonly SpanNode[];
  readonly continuations: readonly { readonly traceId: string; readonly active: boolean }[];
  readonly records: readonly ObservabilityRecord[];
  readonly counts: {
    readonly records: number;
    readonly spans: number;
    readonly continuations: number;
  };
  readonly incomplete: readonly string[];
}
