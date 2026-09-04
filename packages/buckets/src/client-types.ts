import type { MaybePromise } from "@relkit/contracts";

export type BucketOperation =
  "put" | "get" | "head" | "delete" | "exists" | "list" | "createReadUrl" | "createWriteUrl";
export type BucketCapability = "signedReadUrl" | "signedWriteUrl";
export type BucketOperationOutcome =
  "success" | "provider-failure" | "cancelled" | "timeout" | "unsupported";

export interface BucketCapabilities {
  readonly signedReadUrl?: boolean;
  readonly signedWriteUrl?: boolean;
}
export interface BucketOperationContext {
  readonly operation: BucketOperation;
  readonly signal: AbortSignal;
  readonly deadlineMs?: number;
}
export interface BucketObjectMetadata {
  readonly etag: string;
  /** Strong content digest when the provider can calculate one. */
  readonly contentHash?: string;
  readonly contentType?: string;
  readonly size?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}
export interface BucketPutOptions extends Readonly<Record<string, unknown>> {
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}
export interface BucketProvider {
  readonly capabilities?: BucketCapabilities | readonly BucketCapability[];
  readonly put?: (
    key: string,
    bytes: Uint8Array,
    options?: BucketPutOptions,
    context?: BucketOperationContext,
  ) => MaybePromise<void>;
  readonly get?: (
    key: string,
    context?: BucketOperationContext,
  ) => MaybePromise<Uint8Array | undefined>;
  readonly head?: (
    key: string,
    context?: BucketOperationContext,
  ) => MaybePromise<BucketObjectMetadata | undefined>;
  readonly delete?: (key: string, context?: BucketOperationContext) => MaybePromise<void>;
  readonly exists?: (key: string, context?: BucketOperationContext) => MaybePromise<boolean>;
  readonly list?: (
    prefix: string | undefined,
    context?: BucketOperationContext,
  ) => MaybePromise<readonly string[]>;
  readonly createReadUrl?: (key: string, context?: BucketOperationContext) => MaybePromise<string>;
  readonly createWriteUrl?: (key: string, context?: BucketOperationContext) => MaybePromise<string>;
}
export interface BucketClient {
  put(key: string, bytes: Uint8Array, options?: BucketPutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  head(key: string): Promise<BucketObjectMetadata | undefined>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<readonly string[]>;
  createReadUrl(key: string): Promise<string>;
  createWriteUrl(key: string): Promise<string>;
}
export interface BucketBridgeOptions {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly input?: unknown;
}
export interface BucketInvocationBridge {
  readonly run: <A>(operation: () => MaybePromise<A>, options?: BucketBridgeOptions) => Promise<A>;
}
export interface BucketObservedEdge {
  readonly relationship: "uses-bucket";
  readonly from: string;
  readonly to: string;
}
export interface BucketOperationObservation {
  readonly capability: "buckets";
  readonly operation: BucketOperation;
  readonly ownerId: string;
  readonly bucketId: string;
  readonly outcome: BucketOperationOutcome;
}
export interface BucketClientOptions {
  readonly ownerId: string;
  readonly bucketId: string;
  readonly source: unknown;
  readonly bridge?: BucketInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly declared?: boolean;
  readonly onObservedEdge?: (edge: BucketObservedEdge) => void;
  readonly onOperation?: (operation: BucketOperationObservation) => void;
}

export class BucketCapabilityError extends Error {
  readonly code = "RELKIT_BUCKET_CAPABILITY_UNSUPPORTED" as const;
  constructor(
    readonly capability: BucketCapability,
    readonly operation: BucketOperation,
  ) {
    super(`Bucket operation "${operation}" requires unsupported capability "${capability}"`);
    this.name = "BucketCapabilityError";
  }
}
export class BucketDependencyError extends Error {
  readonly code = "RELKIT_BUCKET_DEPENDENCY_UNDECLARED" as const;
  constructor(bucketId: string) {
    super(`Bucket dependency "${bucketId}" is not declared on this function`);
    this.name = "BucketDependencyError";
  }
}
export class BucketProviderError extends Error {
  readonly code = "RELKIT_BUCKET_PROVIDER_UNAVAILABLE" as const;
  constructor(operation: BucketOperation) {
    super(`Bucket provider does not implement "${operation}"`);
    this.name = "ProviderError";
  }
}
export class BucketOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;
  constructor() {
    super("Bucket operation cancelled");
    this.name = "AbortError";
  }
}
export class BucketOperationTimeoutError extends Error {
  readonly code = "ETIMEDOUT" as const;
  constructor() {
    super("Bucket operation timed out");
    this.name = "TimeoutError";
  }
}
