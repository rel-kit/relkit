import { Schema } from "effect";
import { StateCount } from "../state.schemas.js";

/** Version-one durable record envelope; domain semantic checks run after decoding. */
export const JobRecordSchema = Schema.Struct({
  version: Schema.Literal(1),
  sequence: StateCount,
  instanceId: Schema.String,
  kind: Schema.String,
  timestamp: StateCount,
  data: Schema.Json,
});

/** Latest sequence and byte offset for an instance in the recovered journal. */
export const JobIndexEntrySchema = Schema.Struct({ sequence: StateCount, offset: StateCount });

/** Derived journal index with its durable commit identity. */
export const JobIndexSchema = Schema.Struct({
  version: Schema.Literal(1),
  commit: StateCount,
  entries: Schema.Record(Schema.String, JobIndexEntrySchema),
});

/** Versioned durable replay checkpoint rebuilt from accepted records. */
export const JobCheckpointSchema = Schema.Struct({
  version: Schema.Literal(1),
  commit: StateCount,
  sequence: StateCount,
  offset: StateCount,
  recordCount: StateCount,
});
