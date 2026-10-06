import { Schema } from "effect";
import {
  OBSERVABILITY_QUERY_PROTOCOL,
  OBSERVABILITY_QUERY_VERSION,
  type SpanNode,
} from "@relkit/observability";
import {
  telemetryLogSchema,
  telemetryRecordSchema,
  telemetryRequestSchema,
  telemetrySpanSchema,
  telemetryTraceSchema,
} from "./dev-telemetry.schemas.js";

const identity = {
  protocol: Schema.Literal(OBSERVABILITY_QUERY_PROTOCOL),
  version: Schema.Literal(OBSERVABILITY_QUERY_VERSION),
};
const cursor = { nextCursor: Schema.optionalKey(Schema.String) };
const traceItem = Schema.Union([telemetryTraceSchema, telemetrySpanSchema, telemetryRequestSchema]);
const spanNode: Schema.Codec<SpanNode> = Schema.suspend(() =>
  Schema.Struct({ span: telemetrySpanSchema, children: Schema.Array(spanNode) }),
);

/** Native worker log page preserving model fields and pagination. */
export const telemetryLogsSchema = Schema.Struct({
  ...identity,
  ...cursor,
  items: Schema.Array(telemetryLogSchema),
});
/** Native worker request page preserving model fields and pagination. */
export const telemetryRequestsSchema = Schema.Struct({
  ...identity,
  ...cursor,
  items: Schema.Array(telemetryRequestSchema),
});
/** Native worker trace page preserving its existing heterogeneous model records. */
export const telemetryTracesSchema = Schema.Struct({
  ...identity,
  ...cursor,
  items: Schema.Array(traceItem),
});
/** Original optional log detail. */
export const telemetryLogDetailSchema = Schema.Union([
  Schema.Undefined,
  Schema.Struct({ ...identity, log: telemetryLogSchema }),
]);
/** Original optional trace detail and continuation cursor. */
export const telemetryTraceDetailSchema = Schema.Union([
  Schema.Undefined,
  Schema.Struct({
    ...identity,
    ...cursor,
    trace: Schema.optionalKey(telemetryTraceSchema),
    spans: Schema.Array(telemetrySpanSchema),
    records: Schema.Array(traceItem),
  }),
]);
/** Original optional assembled request detail, including recursive span ancestry. */
export const telemetryRequestDetailSchema = Schema.Union([
  Schema.Undefined,
  Schema.Struct({
    ...identity,
    request: telemetryRequestSchema,
    spans: Schema.Array(telemetrySpanSchema),
    roots: Schema.Array(spanNode),
    continuations: Schema.Array(Schema.Struct({ traceId: Schema.String, active: Schema.Boolean })),
    records: Schema.Array(telemetryRecordSchema),
    counts: Schema.Struct({
      records: Schema.Number,
      spans: Schema.Number,
      continuations: Schema.Number,
    }),
    incomplete: Schema.Array(Schema.String),
  }),
]);
