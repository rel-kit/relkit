/**
 * The bucket policy every provider applies the same way: object size, allowed content types and
 * the content type and length a signed upload URL is issued for.
 */
import type { BucketPolicy, BucketWriteUrlOptions } from "./client-provider.types.js";

const CONTENT_TYPE = /^(?:[A-Za-z0-9!#$&^_.+-]+|\*)\/(?:[A-Za-z0-9!#$&^_.+-]+|\*)$/;

/** An object, a signed upload request or a bucket setting breaks the bucket policy.
 * @param message - The rule that failed.
 * @example throw new BucketPolicyError("Bucket content type is not allowed");
 */
export class BucketPolicyError extends TypeError {
  readonly code = "RELKIT_BUCKET_POLICY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "BucketPolicyError";
  }
}

/** Validates a bucket's limits and normalizes its content types.
 * @param policy - Limits a provider was configured with.
 * @returns The frozen policy with lower-case, trimmed content types.
 * @throws BucketPolicyError when a limit is malformed.
 * @example const policy = normalizeBucketPolicy({ maxObjectBytes: 5_000_000 });
 */
export function normalizeBucketPolicy(policy: BucketPolicy): Readonly<BucketPolicy> {
  const { maxObjectBytes, allowedContentTypes } = policy;
  if (
    maxObjectBytes !== undefined &&
    (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes <= 0)
  )
    throw new BucketPolicyError("maxObjectBytes must be a positive safe integer");
  if (allowedContentTypes === undefined)
    return Object.freeze(maxObjectBytes === undefined ? {} : { maxObjectBytes });
  if (!Array.isArray(allowedContentTypes) || allowedContentTypes.length === 0)
    throw new BucketPolicyError("allowedContentTypes must not be empty");
  const types = allowedContentTypes.map((entry) => {
    if (typeof entry !== "string" || !CONTENT_TYPE.test(entry.trim()))
      throw new BucketPolicyError("allowedContentTypes contains an invalid MIME type");
    return entry.trim().toLowerCase();
  });
  if (new Set(types).size !== types.length)
    throw new BucketPolicyError("allowedContentTypes must be unique");
  return Object.freeze({
    ...(maxObjectBytes === undefined ? {} : { maxObjectBytes }),
    allowedContentTypes: Object.freeze(types),
  });
}

/** Validates the content type and length a signed upload URL is requested for.
 * @param options - Caller-declared upload; both fields are optional.
 * @returns The options with a trimmed content type.
 * @throws BucketPolicyError when a field is malformed.
 * @example normalizeWriteUrlOptions({ contentType: "image/png", contentLength: 1024 });
 */
export function normalizeWriteUrlOptions(
  options: BucketWriteUrlOptions | undefined,
): BucketWriteUrlOptions {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new BucketPolicyError("Signed upload options must be an object");
  const { contentType, contentLength } = options;
  if (
    contentType !== undefined &&
    (typeof contentType !== "string" || !isContentType(contentType) || contentType.includes("*"))
  )
    throw new BucketPolicyError("contentType must be a valid MIME type");
  if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0))
    throw new BucketPolicyError("contentLength must be a non-negative safe integer");
  // The type is signed as declared: the uploader must send this exact header value.
  return {
    ...(contentType === undefined ? {} : { contentType: contentType.trim() }),
    ...(contentLength === undefined ? {} : { contentLength }),
  };
}

/** Finds the rule an object breaks.
 * @param policy - Normalized bucket limits.
 * @param object - The object's size and content type; a missing type breaks a type allow-list
 * unless `typeOptional` is set, as for a signed upload that declares no type.
 * @returns The failed rule's message, or undefined when the object is allowed.
 * @example bucketPolicyViolation({ maxObjectBytes: 1 }, { size: 2 }); // "Bucket object exceeds maxObjectBytes"
 */
export function bucketPolicyViolation(
  policy: Readonly<BucketPolicy>,
  object: {
    readonly size?: number;
    readonly contentType?: string;
    readonly typeOptional?: boolean;
  },
): string | undefined {
  if (
    policy.maxObjectBytes !== undefined &&
    object.size !== undefined &&
    object.size > policy.maxObjectBytes
  )
    return "Bucket object exceeds maxObjectBytes";
  const allowed = policy.allowedContentTypes;
  if (allowed === undefined) return undefined;
  if (object.contentType === undefined)
    return object.typeOptional === true ? undefined : "Bucket content type is not allowed";
  const type = object.contentType.trim().toLowerCase();
  return allowed.some((pattern) => matchesContentType(type, pattern))
    ? undefined
    : "Bucket content type is not allowed";
}

/** Checks a signed upload request against the bucket policy before any URL is signed.
 * @param policy - Normalized bucket limits.
 * @param options - Caller-declared content type and length.
 * @returns The validated options to bind into the signature.
 * @throws BucketPolicyError when the declaration is malformed or not allowed.
 * @example assertWriteUrlAllowed({ allowedContentTypes: ["image/*"] }, { contentType: "image/png" });
 */
export function assertWriteUrlAllowed(
  policy: Readonly<BucketPolicy>,
  options: BucketWriteUrlOptions | undefined,
): BucketWriteUrlOptions {
  const declared = normalizeWriteUrlOptions(options);
  const violation = bucketPolicyViolation(policy, {
    ...(declared.contentLength === undefined ? {} : { size: declared.contentLength }),
    ...(declared.contentType === undefined ? {} : { contentType: declared.contentType }),
    typeOptional: true,
  });
  if (violation !== undefined) throw new BucketPolicyError(violation);
  return declared;
}

/** The headers a signed upload URL binds for a declaration: the exact `content-type` and, when
 * a length is declared, the exact `content-length` (a presigned PUT cannot bind a range).
 * @param options - Validated declaration from {@link assertWriteUrlAllowed}.
 * @returns Lower-case header names and the values the upload must send.
 * @example signedUploadHeaders({ contentType: "image/png" }); // { "content-type": "image/png" }
 */
export function signedUploadHeaders(
  options: BucketWriteUrlOptions,
): Readonly<Record<string, string>> {
  return {
    ...(options.contentType === undefined ? {} : { "content-type": options.contentType }),
    ...(options.contentLength === undefined
      ? {}
      : { "content-length": String(options.contentLength) }),
  };
}

/** Checks a content type against an exact or wildcard MIME pattern.
 * @param value - Lower-case content type.
 * @param allowed - Lower-case exact type, `type/*` or `*` + `/*`.
 * @returns Whether the pattern admits the type.
 * @example matchesContentType("image/png", "image/*"); // true
 */
export function matchesContentType(value: string, allowed: string): boolean {
  return (
    allowed === "*/*" ||
    allowed === value ||
    (allowed.endsWith("/*") && value.startsWith(allowed.slice(0, -1)))
  );
}

/** Tests the MIME syntax bucket policies accept.
 * @param value - Candidate content type.
 * @returns Whether the trimmed value is a `type/subtype` pair.
 */
function isContentType(value: string): boolean {
  return CONTENT_TYPE.test(value.trim());
}
