import { createHash } from "node:crypto";
import type { RunLocatorKeyRing, RunLocatorPayload } from "./run-id.js";
import { RunLocatorError } from "./run-id-errors.js";

export function namespaceHash(application: string, environment: string, scope: string): string {
  assertBoundedText(application);
  assertBoundedText(environment);
  assertBoundedText(scope);
  return `sha256:${createHash("sha256").update(`${application}\0${environment}\0${scope}`).digest("hex")}`;
}

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

export function isBase64Url(value: string | undefined): value is string {
  if (value === undefined || value.length === 0 || !/^[A-Za-z0-9_-]+$/u.test(value)) return false;
  try {
    return Buffer.from(value, "base64url").toString("base64url") === value;
  } catch {
    return false;
  }
}

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
