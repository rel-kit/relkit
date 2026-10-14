/** Validates public native restart outcomes without replacing the provider's persisted record format. */
import { Schema } from "effect";

/** Native agent worker's observed lifecycle, revision and public transcript projection. */
export const RestartAgentReport = Schema.Struct({
  outcome: Schema.Literals(["waiting", "snapshot", "fulfilled", "rejected"]),
  revision: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  runs: Schema.optionalKey(Schema.Array(Schema.String)),
  assistant: Schema.optionalKey(Schema.Array(Schema.Json)),
  terminal: Schema.optionalKey(Schema.Array(Schema.Json)),
});

/** Native provider receipt and reconciled schedule observations; prior acceptance metadata remains provider-owned. */
export const RestartScheduleReport = Schema.Struct({
  id: Schema.String,
  scheduleCount: Schema.Number,
  state: Schema.optionalKey(Schema.String),
  value: Schema.optionalKey(Schema.String),
  buildId: Schema.optionalKey(Schema.String),
});

/** Exact invocation observations emitted by the native job target. */
export const RestartJobInvocation = Schema.Struct({
  orderId: Schema.String,
  attempt: Schema.Number,
});
