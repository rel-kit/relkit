import { Schema } from "effect";

/** Legacy persisted metadata authority: only operationId was required on recovery. */
export const PersistedPendingMetadata = Schema.Struct({ operationId: Schema.String });

/**
 * Validates the recovery discriminator without stripping other legacy fields.
 * @param value - Untrusted parsed sessionStorage entry.
 * @returns Whether the original record meets the intentionally weak existing authority.
 */
export const isPersistedPendingMetadata = Schema.is(PersistedPendingMetadata);
