import { createHash } from "node:crypto";
import type { RunLocatorKeyRing, RunLocatorPayload } from "./run-id.js";
import { RunLocatorError } from "./run-id-errors.js";

/** Hashes the trusted deployment namespace used to bind durable run locators.
 * @param application - Application identity.
 * @param environment - Environment identity.
 * @param scope - Trusted scope identity.
 * @returns A SHA-256 namespace identity.
 * @throws RunLocatorError when an identity is empty or exceeds its byte limit.
 * @example namespaceHash("shop", "production", "orders");
 */
export function namespaceHash(application: string, environment: string, scope: string): string {
  assertBoundedText(application);
  assertBoundedText(environment);
  assertBoundedText(scope);
  return `sha256:${createHash("sha256").update(`${application}\0${environment}\0${scope}`).digest("hex")}`;
}

/** Validates and freezes the payload before it is signed or returned to callers.
 * @param value - Untrusted locator payload.
 * @returns A normalized immutable payload.
 * @throws RunLocatorError for malformed identities or a mismatched namespace.
 * @example normalizePayload(payload);
 */
export function normalizePayload(value: RunLocatorPayload): RunLocatorPayload {
  if (!isRecord(value) || !isRecord(value.native)) throw new RunLocatorError();
  const fields = [
    "application",
    "environment",
    "serviceGeneration",
    "jobId",
    "taskId",
    "taskVersion",
    "buildId",
  ] as const;
  for (const field of fields) assertBoundedText(value[field]);
  if (value.scope !== undefined) assertBoundedText(value.scope);
  assertBoundedText(value.native.kind);
  assertBoundedText(value.native.value, 2048);
  const expectedNamespace =
    value.scope === undefined
      ? value.namespaceHash
      : namespaceHash(value.application, value.environment, value.scope);
  if (expectedNamespace === undefined || !/^sha256:[0-9a-f]{64}$/u.test(expectedNamespace)) {
    throw new RunLocatorError();
  }
  if (value.namespaceHash !== undefined && value.namespaceHash !== expectedNamespace)
    throw new RunLocatorError();
  if (value.schemaHash !== undefined) assertBoundedText(value.schemaHash);
  return Object.freeze({
    application: value.application,
    environment: value.environment,
    serviceGeneration: value.serviceGeneration,
    jobId: value.jobId,
    taskId: value.taskId,
    taskVersion: value.taskVersion,
    buildId: value.buildId,
    namespaceHash: expectedNamespace,
    ...(value.schemaHash === undefined ? {} : { schemaHash: value.schemaHash }),
    native: Object.freeze({ kind: value.native.kind, value: value.native.value }),
  });
}

/** Verifies the active key and every key identifier and secret in a key ring.
 * @param ring - Signing or verification keys.
 * @returns Nothing when the ring is usable.
 * @throws RunLocatorError for missing, oversized, or malformed keys.
 * @example validateRunLocatorKeyRing({ activeKeyId: "v1", keys: { v1: "secret" } });
 */
export function validateRunLocatorKeyRing(ring: RunLocatorKeyRing): void {
  if (!isRecord(ring) || typeof ring.activeKeyId !== "string" || !isRecord(ring.keys))
    throw new RunLocatorError();
  assertSegment(ring.activeKeyId);
  for (const [keyId, secret] of Object.entries(ring.keys)) {
    assertSegment(keyId);
    if (!isSecret(secret)) throw new RunLocatorError();
  }
  if (ring.keys[ring.activeKeyId] === undefined) throw new RunLocatorError();
}

/** Checks canonical unpadded base64url encoding for one locator segment.
 * @param value - Candidate encoded segment.
 * @returns True only for a nonempty canonical base64url string.
 * @example isBase64Url("YQ");
 */
export function isBase64Url(value: string | undefined): value is string {
  if (value === undefined || value.length === 0 || !/^[A-Za-z0-9_-]+$/u.test(value)) return false;
  try {
    return Buffer.from(value, "base64url").toString("base64url") === value;
  } catch {
    return false;
  }
}

/** Validates a bounded printable locator key identifier.
 * @param value - Candidate key identifier.
 * @returns Nothing when the segment is valid.
 * @throws RunLocatorError for unsupported characters or length.
 * @example assertSegment("key-v1");
 */
export function assertSegment(value: string): void {
  if (!/^[A-Za-z0-9._-]{1,256}$/u.test(value)) throw new RunLocatorError();
}

function assertBoundedText(value: unknown, limit = 256): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > limit)
    throw new RunLocatorError();
}

function isSecret(value: unknown): value is string | Uint8Array {
  return (
    (typeof value === "string" && value.length > 0 && byteLength(value) <= 4096) ||
    (value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= 4096)
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
