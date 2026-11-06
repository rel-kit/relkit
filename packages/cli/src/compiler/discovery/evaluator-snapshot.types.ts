import type { Schema } from "effect";
import type { SnapshotDescriptorShape } from "./evaluator-snapshot.js";

/** Trusted descriptor identity; executable metadata remains externally owned. */
export interface SnapshotDescriptorLike extends Schema.Schema.Type<
  typeof SnapshotDescriptorShape
> {}
