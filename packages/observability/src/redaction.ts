import { canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";

export type RedactionMode = "off" | "development-redacted";

export interface RedactionPolicy {
  readonly mode?: RedactionMode;
  readonly maxBytes?: number;
  readonly redactKeys?: readonly string[];
}

type NormalizedRedactionPolicy = Required<Pick<RedactionPolicy, "mode" | "redactKeys">> &
  Pick<RedactionPolicy, "maxBytes">;

export interface RedactedCapture {
  readonly mode: "development-redacted";
  readonly bytes: number;
  readonly truncated: boolean;
  readonly content?: JsonValue;
}

export const DEFAULT_REDACTION_KEYS = Object.freeze([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "api-key",
  "apikey",
  "access-key",
  "private-key",
  "credential",
  "client-secret",
  "session",
]);

const OMIT = Symbol("omit");
const REDACTED = "[REDACTED]" as const;

export function createRedactionPolicy(value: RedactionPolicy = {}): NormalizedRedactionPolicy {
  const mode = value.mode ?? "off";
  if (mode !== "off" && mode !== "development-redacted") {
    throw new TypeError("Redaction mode must be off or development-redacted");
  }
  if (
    value.maxBytes !== undefined &&
    (!Number.isSafeInteger(value.maxBytes) || value.maxBytes <= 0)
  ) {
    throw new TypeError("Redaction maxBytes must be a positive safe integer");
  }
  if (mode === "development-redacted" && value.maxBytes === undefined) {
    throw new TypeError("development-redacted capture requires maxBytes");
  }
  const supplied = value.redactKeys ?? [];
  if (
    !Array.isArray(supplied) ||
    supplied.some((key) => typeof key !== "string" || key.trim() === "")
  ) {
    throw new TypeError("Redaction redactKeys must contain non-empty text values");
  }
  const redactKeys = Object.freeze([
    ...new Set([...DEFAULT_REDACTION_KEYS, ...supplied.map((key) => key.trim())]),
  ]);
  return Object.freeze({
    mode,
    redactKeys,
    ...(value.maxBytes === undefined ? {} : { maxBytes: value.maxBytes }),
  });
}

export function redactRecord(value: unknown, policy?: RedactionPolicy): JsonValue {
  const normalized = createRedactionPolicy(policy);
  return safeValue(redact(value, normalized, false, [], new Set<object>()));
}

export const admitRecord = redactRecord,
  redactValue = redactRecord;

export function captureRedacted(
  value: unknown,
  policy: RedactionPolicy,
): RedactedCapture | undefined {
  const normalized = createRedactionPolicy(policy);
  if (normalized.mode !== "development-redacted") return undefined;
  if (value === undefined) {
    return Object.freeze({ mode: normalized.mode, bytes: 0, truncated: false });
  }
  const content = safeValue(redact(value, normalized, true, [], new Set<object>()));
  const bytes = new TextEncoder().encode(canonicalJson(content)).byteLength;
  if (bytes > normalized.maxBytes!) {
    return Object.freeze({ mode: normalized.mode, bytes: normalized.maxBytes!, truncated: true });
  }
  return Object.freeze({ mode: normalized.mode, bytes, truncated: false, content });
}

function redact(
  value: unknown,
  policy: NormalizedRedactionPolicy,
  capture: boolean,
  path: readonly string[],
  active: Set<object>,
  key?: string,
): JsonValue | typeof OMIT {
  if (key !== undefined && sensitiveKey(key, path, policy.redactKeys)) {
    return capture ? REDACTED : OMIT;
  }
  if (isBinary(value)) return capture ? "[BINARY_REDACTED]" : OMIT;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : REDACTED;
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object" || active.has(value)) return OMIT;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const result = redact(item, policy, capture, [...path, String(index)], active);
        return result === OMIT ? REDACTED : result;
      });
    }
    const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    const sensitiveObject = isSensitiveObject(value);
    for (const name of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined || !("value" in descriptor)) continue;
      const protectedContent = contentKey(name);
      const admittedCapture =
        protectedContent && path.some((segment) => normalizeKey(segment).endsWith("capture"));
      const protectedValue = sensitiveObject && ["value", "default", "example"].includes(name);
      if ((!capture && protectedContent && !admittedCapture) || protectedValue) continue;
      const result = redact(
        descriptor.value,
        policy,
        capture || protectedContent,
        [...path, name],
        active,
        name,
      );
      if (result !== OMIT) output[name] = result;
    }
    return Object.keys(output).length > 0 || Object.keys(value).length === 0 ? output : OMIT;
  } finally {
    active.delete(value);
  }
}

function safeValue(value: JsonValue | typeof OMIT): JsonValue {
  return deepFreeze(value === OMIT ? REDACTED : (JSON.parse(canonicalJson(value)) as JsonValue));
}

function sensitiveKey(
  key: string,
  path: readonly string[],
  configured: readonly string[],
): boolean {
  const compact = normalizeKey(key);
  const fullPath = path.map(normalizeKey).join(".");
  return (
    configured.some((candidate) => {
      const normalized = normalizeKey(candidate);
      return normalized === compact || normalized === fullPath;
    }) ||
    /(?:authorization|cookie|password|passwd|secret|token|apikey|accesskey|privatekey|credential|clientsecret|session)/.test(
      compact,
    )
  );
}

function contentKey(key: string): boolean {
  return /^(?:body|requestbody|responsebody|binary|payload|prompt|result|messages|content|environment|env|modelprompt|modelresult|toolinput|toolresult|request|context|service|servicecontext|principal|tenant)$/.test(
    normalizeKey(key),
  );
}

function isSensitiveObject(value: object): boolean {
  const record = value as Record<string, unknown>;
  return record.sensitive === true || record.secret === true || record.type === "secret";
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

function redactText(value: string): string {
  return value
    .replace(/\b(?:Bearer|Basic)\s+[^\s]+/gi, (match) => `${match.split(/\s+/, 1)[0]} [REDACTED]`)
    .replace(
      /\b(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.slice(0, match.search(/[:=]/) + 1)}[REDACTED]`,
    );
}

function isBinary(value: unknown): boolean {
  return (
    (typeof ArrayBuffer !== "undefined" &&
      (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}
