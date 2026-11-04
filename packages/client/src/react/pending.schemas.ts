/** Legacy persisted metadata authority: only operationId was required on recovery. */
export interface PersistedPendingMetadata {
  readonly operationId: string;
}

/**
 * Validates the recovery discriminator without stripping other legacy fields.
 * @param value - Untrusted parsed sessionStorage entry.
 * @returns Whether the original record meets the intentionally weak existing authority.
 */
export function isPersistedPendingMetadata(value: unknown): value is PersistedPendingMetadata {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { readonly operationId?: unknown }).operationId === "string"
  );
}
