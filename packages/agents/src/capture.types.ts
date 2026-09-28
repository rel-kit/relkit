import type { JsonValue } from "@relkit/contracts";

/**
 * Controls whether an agent may retain redacted content in its spans.
 * Development capture requires a positive byte limit; off ignores the other fields.
 *
 * @example
 * const policy: AgentCapturePolicy = { mode: "development-redacted", maxBytes: 1024 };
 */
export interface AgentCapturePolicy {
  readonly mode: "off" | "development-redacted";
  readonly maxBytes?: number;
  readonly redactKeys?: readonly string[];
}

/**
 * Captured JSON and its encoded size, or a marker when capture was truncated.
 * The content property is absent whenever truncated is true.
 *
 * @example
 * const record: AgentCaptureRecord = { mode: "development-redacted", bytes: 0, truncated: true };
 */
export interface AgentCaptureRecord {
  readonly mode: "development-redacted";
  readonly bytes: number;
  readonly truncated: boolean;
  readonly content?: JsonValue;
}

/**
 * Optional input and output captures attached to one agent span.
 * Absent fields were disabled or unavailable at capture time.
 *
 * @example
 * const capture: AgentSpanCapture = {
 *   input: { mode: "development-redacted", bytes: 0, truncated: true },
 * };
 */
export interface AgentSpanCapture {
  readonly input?: AgentCaptureRecord;
  readonly output?: AgentCaptureRecord;
}
