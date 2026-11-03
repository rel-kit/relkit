/**
 * Typed early-retention policy and acknowledgement failures contain fixed labels.
 * Redaction failures retain their existing owning RecordAdmissionError channel;
 * neither classifies defects or cancellation as a recoverable storage miss.
 */
import { Data } from "effect";

/** Invalid bounded policy or a cursor outside this session's admitted sequence. */
export class EarlyRetentionError extends Data.TaggedError("EarlyRetentionError")<{
  /** Fixed diagnostic label, containing no record, path or secret bytes. */
  readonly operation: "policy.records" | "policy.bytes" | "acknowledge.cursor" | "identity.invalid";
}> {}
