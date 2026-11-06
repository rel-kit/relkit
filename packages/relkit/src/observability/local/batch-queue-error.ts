/** Typed writer rejection retained by the queue's existing failure channel. */
import { Schema } from "effect";

/** A failed batch writer, recorded while the queue continues draining. */
export class LocalBatchWriteError extends Schema.TaggedError<LocalBatchWriteError>()(
  "LocalBatchWriteError",
  { cause: Schema.Defect() },
) {}
