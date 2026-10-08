import { Schema } from "effect";

/** JSON object root for prerequisite metadata; opaque configuration stays owner validated. */
export const doctorJsonObject = Schema.Record(Schema.String, Schema.Unknown);

/** Authored dependency specifications, before strict project catalog resolution. */
export const doctorDependencies = Schema.Record(Schema.String, Schema.String);

/** Public prerequisite result; metadata diagnostics never contain credential values. */
export const doctorCheckSchema = Schema.Struct({
  name: Schema.String,
  ok: Schema.Boolean,
  message: Schema.String,
  details: Schema.optionalKey(doctorJsonObject),
});

/** Public finite doctor report, retaining the existing command identity. */
export const doctorResultSchema = Schema.Struct({
  ok: Schema.Boolean,
  command: Schema.Literal("doctor"),
  projectRoot: Schema.String,
  checks: Schema.Array(doctorCheckSchema),
});
