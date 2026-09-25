/** Stable validation codes for provider authoring failures. */
export type ProviderValidationCode =
  "INVALID_ID" | "INVALID_DESCRIPTOR" | "INVALID_CONNECTION" | "INVALID_PROFILE";
/** Stable codes for connection resolution failures. */
export type ProviderBindingResolutionCode =
  "CONFLICTING_CONNECTION_VALUE" | "MISSING_CONNECTION_VALUE" | "UNKNOWN_CONNECTION_OUTPUT";
