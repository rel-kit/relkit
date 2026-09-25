import type { JsonValue } from "@relkit/contracts";

/** Available capture policies for observability values. */
export type RedactionMode = "off" | "development-redacted";

/** Keys and byte limit used when admitting values to observability. */
export interface RedactionPolicy {
  readonly mode?: RedactionMode;
  readonly maxBytes?: number;
  readonly redactKeys?: readonly string[];
}

/** Validated redaction settings used by runtime admission. */
export type NormalizedRedactionPolicy = Required<Pick<RedactionPolicy, "mode" | "redactKeys">> &
  Pick<RedactionPolicy, "maxBytes">;

/** Bounded, redacted capture returned for development inspection. */
export interface RedactedCapture {
  readonly mode: "development-redacted";
  readonly bytes: number;
  readonly truncated: boolean;
  readonly content?: JsonValue;
}
