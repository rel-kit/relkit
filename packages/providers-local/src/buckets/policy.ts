import type { BucketPutOptions } from "@zsys/buckets";
import {
  LocalBucketPolicyError,
  type LocalBucketPolicy,
  type LocalBucketProviderOptions,
} from "./types.js";

const CONTENT_TYPE = /^(?:[A-Za-z0-9!#$&^_.+-]+|\*)\/(?:[A-Za-z0-9!#$&^_.+-]+|\*)$/;

export function normalizePolicy(options: LocalBucketProviderOptions): Readonly<LocalBucketPolicy> {
  const source = options.policy ?? {};
  const maxObjectBytes = options.maxObjectBytes ?? source.maxObjectBytes;
  if (
    maxObjectBytes !== undefined &&
    (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes <= 0)
  ) {
    throw new LocalBucketPolicyError("maxObjectBytes must be a positive safe integer");
  }
  const sourceTypes = options.allowedContentTypes ?? source.allowedContentTypes;
  const allowedContentTypes =
    sourceTypes === undefined ? undefined : normalizeContentTypes(sourceTypes);
  return Object.freeze({
    ...(maxObjectBytes === undefined ? {} : { maxObjectBytes }),
    ...(allowedContentTypes === undefined ? {} : { allowedContentTypes }),
  });
}

export function validatePut(
  bytes: Uint8Array,
  options: BucketPutOptions | undefined,
  policy: Readonly<LocalBucketPolicy>,
): { readonly contentType?: string; readonly metadata: Readonly<Record<string, string>> } {
  const contentType = normalizeContentType(options?.contentType);
  if (policy.maxObjectBytes !== undefined && bytes.byteLength > policy.maxObjectBytes) {
    throw new LocalBucketPolicyError("Bucket object exceeds maxObjectBytes");
  }
  if (
    policy.allowedContentTypes !== undefined &&
    (contentType === undefined ||
      !policy.allowedContentTypes.some((allowed) => matchesContentType(contentType, allowed)))
  ) {
    throw new LocalBucketPolicyError("Bucket content type is not allowed");
  }
  return {
    ...(contentType === undefined ? {} : { contentType }),
    metadata: normalizeMetadata(options?.metadata),
  };
}

function normalizeContentTypes(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LocalBucketPolicyError("allowedContentTypes must not be empty");
  }
  const result = value.map((entry) => {
    if (typeof entry !== "string" || !CONTENT_TYPE.test(entry.trim())) {
      throw new LocalBucketPolicyError("allowedContentTypes contains an invalid MIME type");
    }
    return entry.trim().toLowerCase();
  });
  if (new Set(result).size !== result.length) {
    throw new LocalBucketPolicyError("allowedContentTypes must be unique");
  }
  return Object.freeze(result);
}

function normalizeContentType(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !CONTENT_TYPE.test(value.trim())) {
    throw new LocalBucketPolicyError("contentType must be a valid MIME type");
  }
  return value.trim().toLowerCase();
}

function normalizeMetadata(value: BucketPutOptions["metadata"]): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({});
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LocalBucketPolicyError("metadata must be a string record");
  }
  const entries = Object.entries(value).map(([key, entry]) => {
    if (key.length === 0 || key.includes("\0") || typeof entry !== "string") {
      throw new LocalBucketPolicyError("metadata must contain non-empty string entries");
    }
    return [key, entry] as const;
  });
  return Object.freeze(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))));
}

function matchesContentType(value: string, allowed: string): boolean {
  return (
    allowed === "*/*" ||
    allowed === value ||
    (allowed.endsWith("/*") && value.startsWith(`${allowed.slice(0, -1)}`))
  );
}
