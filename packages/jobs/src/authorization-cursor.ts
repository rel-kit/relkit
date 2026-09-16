import { createHmac, timingSafeEqual } from "node:crypto";
import { assertJsonValue, canonicalJson, isJsonValue, type JsonValue } from "@relkit/contracts";
import type { JobClientOperation } from "@relkit/contracts/jobs";
import { JobCursorError } from "./authorization-errors.js";

export interface JobCursorBinding {
  readonly application?: string;
  readonly environment?: string;
  readonly scope: string;
  readonly subject?: string;
  readonly jobId: string;
  readonly operation: JobClientOperation;
  readonly filters: JsonValue;
  readonly schema: string;
  readonly position: JsonValue;
}

export interface JobCursorOptions {
  readonly key: string | Uint8Array;
  readonly keyId?: string;
}

export function createJobCursor(binding: JobCursorBinding, options?: JobCursorOptions): string {
  assertBinding(binding);
  const unsigned = {
    version: 1,
    ...(binding.application === undefined ? {} : { application: binding.application }),
    ...(binding.environment === undefined ? {} : { environment: binding.environment }),
    scope: binding.scope,
    ...(binding.subject === undefined ? {} : { subject: binding.subject }),
    jobId: binding.jobId,
    operation: binding.operation,
    filters: binding.filters,
    schema: binding.schema,
    position: binding.position,
  };
  const signed = options === undefined
    ? unsigned
    : {
        ...unsigned,
        ...(options.keyId === undefined ? {} : { keyId: boundedKeyId(options.keyId) }),
      };
  const value = options === undefined ? signed : { ...signed, mac: sign(signed, options) };
  const encoded = Buffer.from(canonicalJson(value), "utf8").toString("base64url");
  if (byteLength(encoded) > 4096) throw new JobCursorError();
  return encoded;
}

export function readJobCursor(
  cursor: string,
  expected: JobCursorBinding,
  options?: JobCursorOptions,
): JobCursorBinding {
  assertBinding(expected);
  if (!isBase64Url(cursor) || byteLength(cursor) > 4096) throw new JobCursorError();
  let value: unknown;
  try {
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) throw new JobCursorError();
    value = JSON.parse(decoded.toString("utf8"));
  } catch (error) {
    if (error instanceof JobCursorError) throw error;
    throw new JobCursorError();
  }
  if (!isRecord(value) || value.version !== 1 || !isJsonValue(value.filters) || !isJsonValue(value.position)) {
    throw new JobCursorError();
  }
  verifySignature(value, options);
  const candidate = readBinding(value);
  if (
    candidate.application !== expected.application ||
    candidate.environment !== expected.environment ||
    candidate.scope !== expected.scope ||
    candidate.jobId !== expected.jobId ||
    candidate.subject !== expected.subject ||
    candidate.operation !== expected.operation ||
    candidate.schema !== expected.schema ||
    canonicalJson(candidate.filters) !== canonicalJson(expected.filters)
  ) {
    throw new JobCursorError();
  }
  return Object.freeze(candidate);
}

function assertBinding(binding: JobCursorBinding): void {
  for (const value of [binding.scope, binding.jobId, binding.operation, binding.schema]) {
    assertBoundedText(value);
  }
  for (const value of [binding.application, binding.environment, binding.subject]) {
    if (value !== undefined) assertBoundedText(value);
  }
  try {
    assertJsonValue(binding.filters);
    assertJsonValue(binding.position);
  } catch {
    throw new JobCursorError();
  }
}

function readBinding(value: Record<string, unknown>): JobCursorBinding {
  const fields = [value.scope, value.jobId, value.operation, value.schema];
  if (fields.some((field) => typeof field !== "string" || field.length === 0)) throw new JobCursorError();
  for (const field of [value.application, value.environment, value.subject]) {
    if (field !== undefined && typeof field !== "string") throw new JobCursorError();
  }
  const candidate = {
    ...(value.application === undefined ? {} : { application: value.application as string }),
    ...(value.environment === undefined ? {} : { environment: value.environment as string }),
    scope: value.scope as string,
    ...(value.subject === undefined ? {} : { subject: value.subject as string }),
    jobId: value.jobId as string,
    operation: value.operation as JobClientOperation,
    filters: value.filters as JsonValue,
    schema: value.schema as string,
    position: value.position as JsonValue,
  };
  assertBinding(candidate);
  return candidate;
}

function verifySignature(value: Record<string, unknown>, options: JobCursorOptions | undefined): void {
  const mac = value.mac;
  if (mac === undefined && options === undefined) return;
  if (options === undefined || typeof mac !== "string" || !isBase64Url(mac)) throw new JobCursorError();
  const keyId = value.keyId;
  if (keyId !== undefined && (typeof keyId !== "string" || keyId !== options.keyId)) {
    throw new JobCursorError();
  }
  if (options.keyId !== undefined && keyId !== options.keyId) throw new JobCursorError();
  const { mac: _ignored, ...unsigned } = value;
  const expected = Buffer.from(sign(unsigned, options), "base64url");
  const actual = Buffer.from(mac, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new JobCursorError();
  }
}

function sign(value: Record<string, unknown>, options: JobCursorOptions): string {
  if (!(typeof options.key === "string" || options.key instanceof Uint8Array)) {
    throw new JobCursorError();
  }
  return createHmac("sha256", options.key).update(canonicalJson(value), "utf8").digest("base64url");
}

function boundedKeyId(value: string): string {
  assertBoundedText(value);
  return value;
}

function assertBoundedText(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > 256) throw new JobCursorError();
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isBase64Url(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && /^[A-Za-z0-9_-]+$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
