import { Schema } from "effect";

/** Trimmed bounded identity component shared by generations and idempotency keys. */
export const InspectorActionId = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(128));

/** Trimmed graph identity; projection happens before decoding to avoid private getters. */
export const InspectorActionGraphHash = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(256),
);

/** Executable action identity boundary; body payloads are deliberately excluded. */
export const InspectorActionIdentity = Schema.Struct({
  generationId: InspectorActionId,
  graphHash: InspectorActionGraphHash,
  idempotencyKey: InspectorActionId,
});
