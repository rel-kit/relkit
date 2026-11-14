import type { MaybePromise } from "../contracts/index.js";

/** Fixed names for provider operations; safe as telemetry labels.
 * @example const operation: BucketOperation = "get";
 */
export type BucketOperation =
  "put" | "get" | "head" | "delete" | "exists" | "list" | "createReadUrl" | "createWriteUrl";

/** Optional signed URL capabilities advertised by a provider.
 * @example const capability: BucketCapability = "signedReadUrl";
 */
export type BucketCapability = "signedReadUrl" | "signedWriteUrl";

/** Provider capability flags.
 * @example const capabilities: BucketCapabilities = { signedReadUrl: true };
 */
export interface BucketCapabilities {
  readonly signedReadUrl?: boolean;
  readonly signedWriteUrl?: boolean;
}

/** Per-call context passed to providers.
 * @example const signal = context.signal;
 */
export interface BucketOperationContext {
  readonly operation: BucketOperation;
  readonly signal: AbortSignal;
  readonly deadlineMs?: number;
}

/** Portable object metadata returned by a provider.
 * @example const metadata: BucketObjectMetadata = { etag: "sha256:abc", size: 3 };
 */
export interface BucketObjectMetadata {
  readonly etag: string;
  /** Strong content digest when the provider can calculate one. */
  readonly contentHash?: string;
  readonly contentType?: string;
  readonly size?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Metadata and content type supplied when storing bytes.
 * @example const options: BucketPutOptions = { contentType: "image/png" };
 */
export interface BucketPutOptions extends Readonly<Record<string, unknown>> {
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** A bucket's object limits, as declared with `defineBucket`.
 * @example const policy: BucketPolicy = { maxObjectBytes: 5_000_000, allowedContentTypes: ["image/*"] };
 */
export interface BucketPolicy {
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

/** The upload a signed write URL is issued for. A declared type is checked against the bucket's
 * allowed types and signed, so storage rejects an upload with another type; a declared length is
 * checked against `maxObjectBytes` and signed as the exact `content-length`. Without them the URL
 * binds neither, and the bucket's limits are not enforced on the upload.
 * @example const options: BucketWriteUrlOptions = { contentType: "image/png", contentLength: 1024 };
 */
export interface BucketWriteUrlOptions {
  readonly contentType?: string;
  readonly contentLength?: number;
}

/** Provider implementation; omitted operations fail with BucketProviderError.
 * @example const provider: BucketProvider = { get: () => undefined };
 */
export interface BucketProvider {
  readonly capabilities?: BucketCapabilities | readonly BucketCapability[];
  /** Store an object.
   * @param key - Portable object key.
   * @param bytes - Object content.
   * @param options - Optional content metadata.
   * @param context - Cancellation and deadline context.
   * @returns Completion or a provider rejection.
   * @example await provider.put?.("a", new Uint8Array());
   */
  readonly put?: (
    key: string,
    bytes: Uint8Array,
    options?: BucketPutOptions,
    context?: BucketOperationContext,
  ) => MaybePromise<void>;
  /** Read an object.
   * @param key - Portable object key.
   * @param context - Cancellation and deadline context.
   * @returns Bytes, undefined, or a provider rejection.
   * @example await provider.get?.("a");
   */
  readonly get?: (
    key: string,
    context?: BucketOperationContext,
  ) => MaybePromise<Uint8Array | undefined>;
  /** Read object metadata.
   * @param key - Portable object key.
   * @param context - Cancellation and deadline context.
   * @returns Metadata, undefined, or a provider rejection.
   * @example await provider.head?.("a");
   */
  readonly head?: (
    key: string,
    context?: BucketOperationContext,
  ) => MaybePromise<BucketObjectMetadata | undefined>;
  /** Remove an object.
   * @param key - Portable object key.
   * @param context - Cancellation and deadline context.
   * @returns Completion or a provider rejection.
   * @example await provider.delete?.("a");
   */
  readonly delete?: (key: string, context?: BucketOperationContext) => MaybePromise<void>;
  /** Check whether an object exists.
   * @param key - Portable object key.
   * @param context - Cancellation and deadline context.
   * @returns Existence or a provider rejection.
   * @example await provider.exists?.("a");
   */
  readonly exists?: (key: string, context?: BucketOperationContext) => MaybePromise<boolean>;
  /** List keys in provider order.
   * @param prefix - Optional portable prefix.
   * @param context - Cancellation and deadline context.
   * @returns Ordered keys or a provider rejection.
   * @example await provider.list?.("images/");
   */
  readonly list?: (
    prefix: string | undefined,
    context?: BucketOperationContext,
  ) => MaybePromise<readonly string[]>;
  /** Create a signed read URL.
   * @param key - Portable object key.
   * @param context - Cancellation and deadline context.
   * @returns URL text or a provider rejection.
   * @example await provider.createReadUrl?.("a");
   */
  readonly createReadUrl?: (key: string, context?: BucketOperationContext) => MaybePromise<string>;
  /** Create a signed write URL.
   * @param key - Portable object key.
   * @param context - Cancellation and deadline context.
   * @param options - Content type and length to check against the policy and bind to the URL.
   * @returns URL text or a provider rejection.
   * @example await provider.createWriteUrl?.("a", undefined, { contentType: "image/png" });
   */
  readonly createWriteUrl?: (
    key: string,
    context?: BucketOperationContext,
    options?: BucketWriteUrlOptions,
  ) => MaybePromise<string>;
}
