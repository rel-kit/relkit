import { Schema } from "effect";

/** Complete child log boundary; validation retains the original JSON envelope. */
export const runtimeLogSchema = Schema.Struct({
  version: Schema.Literal(2),
  signal: Schema.Literal("log"),
  timestamp: Schema.String,
  component: Schema.String,
  message: Schema.String,
  level: Schema.Literals(["trace", "debug", "info", "warn", "error", "fatal"]),
  fields: Schema.Record(Schema.String, Schema.Json),
  requestId: Schema.optionalKey(Schema.String),
  traceId: Schema.optionalKey(Schema.String),
  spanId: Schema.optionalKey(Schema.String),
  functionId: Schema.optionalKey(Schema.String),
  serviceId: Schema.optionalKey(Schema.String),
  originRequestId: Schema.optionalKey(Schema.String),
  invocationId: Schema.optionalKey(Schema.String),
  generationId: Schema.optionalKey(Schema.String),
  graphHash: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
});

/** Optional nested error payload inspected only by the bounded pure detail renderer. */
export const errorDetailSchema = Schema.Record(Schema.String, Schema.Unknown);
