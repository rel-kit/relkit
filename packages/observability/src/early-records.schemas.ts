/**
 * Validates bounded producer identities before they enter early retention.
 * Record validation and redaction remain owned by the existing admission domain;
 * these transport fields enable idempotent handoff without retaining raw bytes.
 */
import { Schema } from "effect";

/** Only the persistent store's established identities may be retained for handoff. */
export const EarlyRecordIdentity = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
  origin: Schema.Literals(["application", "relkit", "inspector"]),
});
