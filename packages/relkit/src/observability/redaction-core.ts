import { canonicalJson, deepFreeze, type JsonValue } from "../contracts/index.js";
import type {
  NormalizedRedactionPolicy,
  RedactedCapture,
  RedactionPolicy,
} from "./redaction.types.js";
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
function createRedactionPolicy(value: RedactionPolicy = {}): NormalizedRedactionPolicy {
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
function redactRecord(value: unknown, policy?: RedactionPolicy): JsonValue {
  const normalized = createRedactionPolicy(policy);
  return safeValue(redact(value, normalized, false, ROOT, new Set<object>()));
}
export function captureRedacted(
  value: unknown,
  policy: RedactionPolicy,
): RedactedCapture | undefined {
  const normalized = createRedactionPolicy(policy);
  if (normalized.mode !== "development-redacted") return undefined;
  if (value === undefined) {
    return Object.freeze({ mode: normalized.mode, bytes: 0, truncated: false });
  }
  const content = safeValue(redact(value, normalized, true, ROOT, new Set<object>()));
  const bytes = new TextEncoder().encode(canonicalJson(content)).byteLength;
  if (bytes > normalized.maxBytes!) {
    return Object.freeze({ mode: normalized.mode, bytes: normalized.maxBytes!, truncated: true });
  }
  return Object.freeze({ mode: normalized.mode, bytes, truncated: false, content });
}
/** Where the walk is: the normalized ancestor keys joined by "." and whether one ends in "capture". */
interface RedactionPath {
  readonly depth: number;
  readonly normalized: string;
  readonly underCapture: boolean;
}
const ROOT: RedactionPath = { depth: 0, normalized: "", underCapture: false };
function redact(
  value: unknown,
  policy: NormalizedRedactionPolicy,
  capture: boolean,
  path: RedactionPath,
  active: Set<object>,
  key?: string,
): JsonValue | typeof OMIT {
  if (key !== undefined && sensitiveKey(key, path.normalized, policy.redactKeys)) {
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
        const result = redact(item, policy, capture, child(path, String(index)), active);
        return result === OMIT ? REDACTED : result;
      });
    }
    const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    const sensitiveObject = isSensitiveObject(value);
    const names = Object.keys(value).sort();
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined || !("value" in descriptor)) continue;
      const protectedContent = contentKey(name);
      const admittedCapture = protectedContent && path.underCapture;
      const protectedValue = sensitiveObject && ["value", "default", "example"].includes(name);
      if ((!capture && protectedContent && !admittedCapture) || protectedValue) continue;
      const result = redact(
        descriptor.value,
        policy,
        capture || protectedContent,
        child(path, name),
        active,
        name,
      );
      if (result !== OMIT) output[name] = result;
    }
    return Object.keys(output).length > 0 || names.length === 0 ? output : OMIT;
  } finally {
    active.delete(value);
  }
}
function child(path: RedactionPath, segment: string): RedactionPath {
  const normalized = normalizeKey(segment);
  return {
    depth: path.depth + 1,
    normalized: path.depth === 0 ? normalized : `${path.normalized}.${normalized}`,
    underCapture: path.underCapture || normalized.endsWith("capture"),
  };
}
/** Copies redacted output as the canonical JSON round trip did: plain objects, sorted keys, -0 as 0. */
function safeValue(value: JsonValue | typeof OMIT): JsonValue {
  return deepFreeze(value === OMIT ? REDACTED : plainCopy(value));
}
function plainCopy(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(plainCopy);
  if (value === null || typeof value !== "object") return Object.is(value, -0) ? 0 : value;
  const record = value as { readonly [key: string]: JsonValue };
  const copy: Record<string, JsonValue> = {};
  for (const name of Object.keys(record).sort()) copy[name] = plainCopy(record[name]!);
  return copy;
}
function sensitiveKey(key: string, fullPath: string, configured: readonly string[]): boolean {
  const keys = configuredKeys(configured);
  const compact = normalizeKey(key);
  return (
    keys.has(compact) ||
    keys.has(fullPath) ||
    /(?:authorization|cookie|password|passwd|secret|token|apikey|accesskey|privatekey|credential|clientsecret|session)/.test(
      compact,
    )
  );
}
/** Normalized configured keys by configuration; policies are rebuilt per record from the same lists. */
function configuredKeys(configured: readonly string[]): ReadonlySet<string> {
  const id = configured.join("\0");
  let keys = configuredKeySets.get(id);
  if (keys === undefined) {
    keys = new Set(configured.map(normalizeKey));
    if (configuredKeySets.size < 100) configuredKeySets.set(id, keys);
  }
  return keys;
}
const configuredKeySets = new Map<string, ReadonlySet<string>>();
function contentKey(key: string): boolean {
  let known = contentKeys.get(key);
  if (known === undefined) {
    known =
      /^(?:body|requestbody|responsebody|binary|payload|prompt|result|messages|content|environment|env|modelprompt|modelresult|toolinput|toolresult|request|context|service|servicecontext|principal|tenant)$/.test(
        normalizeKey(key),
      );
    if (contentKeys.size < KEY_CACHE_LIMIT) contentKeys.set(key, known);
  }
  return known;
}
function isSensitiveObject(value: object): boolean {
  const record = value as Record<string, unknown>;
  return record.sensitive === true || record.secret === true || record.type === "secret";
}
function normalizeKey(value: string): string {
  let normalized = normalizedKeys.get(value);
  if (normalized === undefined) {
    normalized = value.toLowerCase().replace(/[\s_-]/g, "");
    if (normalizedKeys.size < KEY_CACHE_LIMIT) normalizedKeys.set(value, normalized);
  }
  return normalized;
}
// Records repeat the same field names, so key spellings are normalized once per name.
const KEY_CACHE_LIMIT = 10_000;
const normalizedKeys = new Map<string, string>();
const contentKeys = new Map<string, boolean>();
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
/** Internal pure redaction rules executed by the observed Effect operations. */
export const redactionCore = { createRedactionPolicy, redactRecord, captureRedacted };
