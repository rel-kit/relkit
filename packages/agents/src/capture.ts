import { canonicalJson, deepFreeze, type JsonValue } from "@zsys/contracts";

export interface AgentCapturePolicy {
  readonly mode: "off" | "development-redacted";
  readonly maxBytes?: number;
  readonly redactKeys?: readonly string[];
}

export interface AgentCaptureRecord {
  readonly mode: "development-redacted";
  readonly bytes: number;
  readonly truncated: boolean;
  readonly content?: JsonValue;
}

export interface AgentSpanCapture {
  readonly input?: AgentCaptureRecord;
  readonly output?: AgentCaptureRecord;
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

export function createAgentCapturePolicy(
  value: AgentCapturePolicy | undefined,
): AgentCapturePolicy {
  if (value === undefined || value.mode === "off") return Object.freeze({ mode: "off" });
  if (value.mode !== "development-redacted") {
    throw new TypeError("Agent capture mode must be off or development-redacted");
  }
  const maxBytes = value.maxBytes;
  if (!Number.isSafeInteger(maxBytes) || (maxBytes as number) <= 0) {
    throw new TypeError("Agent capture maxBytes must be a positive safe integer");
  }
  const supplied = value.redactKeys ?? [];
  if (!Array.isArray(supplied) || supplied.some((key) => typeof key !== "string")) {
    throw new TypeError("Agent capture redactKeys must be text values");
  }
  return Object.freeze({
    mode: value.mode,
    maxBytes: maxBytes as number,
    redactKeys: Object.freeze([
      ...new Set([...DEFAULT_REDACT_KEYS, ...supplied.map((key) => key.toLowerCase())]),
    ]),
  });
}

export function captureAgentContent(
  value: unknown,
  policy: AgentCapturePolicy,
): AgentCaptureRecord | undefined {
  if (policy.mode !== "development-redacted" || value === undefined) return undefined;
  try {
    const redacted = redact(value, policy.redactKeys ?? DEFAULT_REDACT_KEYS);
    const serialized = canonicalJson(redacted);
    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > policy.maxBytes!) {
      return Object.freeze({ mode: policy.mode, bytes: policy.maxBytes!, truncated: true });
    }
    return Object.freeze({
      mode: policy.mode,
      bytes,
      truncated: false,
      content: deepFreeze(JSON.parse(serialized) as JsonValue),
    });
  } catch {
    return Object.freeze({ mode: policy.mode, bytes: 0, truncated: true });
  }
}

export function createAgentSpanCapture(
  input: AgentCaptureRecord | undefined,
  output: AgentCaptureRecord | undefined,
): AgentSpanCapture | undefined {
  if (input === undefined && output === undefined) return undefined;
  return Object.freeze({
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
  });
}

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
