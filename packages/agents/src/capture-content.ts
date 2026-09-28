import { canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";
import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentCapturePolicy, AgentCaptureRecord } from "./capture.types.js";

const captureCount = Metric.counter("relkit.agents.capture.content.total");
const truncatedCount = Metric.counter("relkit.agents.capture.content.truncated.total");

/**
 * Redacts and bounds a JSON-compatible agent value.
 *
 * @param value - Untrusted content to capture.
 * @param policy - Canonical capture policy.
 * @returns An Effect with an immutable record or undefined; serialization failures produce a truncation marker.
 * @example
 * const record = Effect.runSync(captureAgentContentEffect({ token: "secret" }, policy));
 */
export const captureAgentContentEffect = Effect.fn("Agents.capture.content")(
  function* (value: unknown, policy: AgentCapturePolicy) {
    yield* Metric.update(captureCount, 1);
    if (policy.mode !== "development-redacted" || value === undefined) return undefined;
    const maxBytes = policy.maxBytes ?? Number.POSITIVE_INFINITY;
    let record: AgentCaptureRecord;
    try {
      const redacted = redact(value, policy.redactKeys ?? DEFAULT_REDACT_KEYS);
      const serialized = canonicalJson(redacted);
      const bytes = new TextEncoder().encode(serialized).byteLength;
      record =
        bytes > maxBytes
          ? Object.freeze({ mode: policy.mode, bytes: maxBytes, truncated: true })
          : Object.freeze({
              mode: policy.mode,
              bytes,
              truncated: false,
              content: deepFreeze(JSON.parse(serialized) as JsonValue),
            });
    } catch {
      record = Object.freeze({ mode: policy.mode, bytes: 0, truncated: true });
    }
    if (record.truncated) yield* Metric.update(truncatedCount, 1);
    return record;
  },
  (effect) => observeAgent("capture.content", effect),
);

/**
 * Captures redacted content for synchronous runtime callers.
 *
 * @param value - Untrusted content to capture.
 * @param policy - Canonical capture policy.
 * @returns A frozen record or undefined when capture is disabled.
 * @example
 * const record = captureAgentContent({ token: "secret" }, policy);
 */
export function captureAgentContent(
  value: unknown,
  policy: AgentCapturePolicy,
): AgentCaptureRecord | undefined {
  return Effect.runSync(captureAgentContentEffect(value, policy));
}

const DEFAULT_REDACT_KEYS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "api-key",
  "apikey",
  "credential",
];

function redact(value: unknown, keys: readonly string[], key?: string): JsonValue {
  if (key !== undefined && keys.some((candidate) => key.toLowerCase().includes(candidate))) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return value
      .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
      .replace(
        /((?:password|token|secret|authorization|cookie|api[-_]?key)\s*[:=]\s*)[^\s,;]+/gi,
        "$1[REDACTED]",
      );
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, keys));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [name, redact(entry, keys, name)]),
    );
  }
  return value as JsonValue;
}
