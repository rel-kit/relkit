import type { MaybePromise } from "@zsys/contracts";
import type { StandardIssue, StandardSchemaV1 } from "@zsys/schema";

export type CacheOperation = "get" | "set" | "delete" | "has" | "getOrSet" | "increment";
export type CacheCapability = "increment";
export type CacheOperationOutcome =
  "success" | "provider-failure" | "cancelled" | "timeout" | "unsupported" | "validation-error";

export interface CacheOperationOptions {
  readonly ttlMs?: number;
}

export interface CacheOperationContext {
  readonly operation: CacheOperation;
  readonly signal: AbortSignal;
  readonly deadlineMs?: number;
}

export interface CacheCapabilities {
  readonly increment?: boolean;
}

export interface CacheProvider {
  readonly capabilities?: CacheCapabilities | readonly CacheCapability[];
  readonly get?: (
    key: unknown,
    context?: CacheOperationContext,
  ) => MaybePromise<unknown | undefined>;
  readonly set?: (
    key: unknown,
    value: unknown,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => MaybePromise<void>;
  readonly delete?: (key: unknown, context?: CacheOperationContext) => MaybePromise<void>;
  readonly has?: (key: unknown, context?: CacheOperationContext) => MaybePromise<boolean>;
  readonly getOrSet?: (
    key: unknown,
    produce: () => MaybePromise<unknown>,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => MaybePromise<unknown>;
  readonly increment?: (
    key: unknown,
    delta: number,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => MaybePromise<unknown>;
}

export interface CacheClientBase<Key, Value> {
  get(key: Key): Promise<Value | undefined>;
  set(key: Key, value: Value, options?: CacheOperationOptions): Promise<void>;
  delete(key: Key): Promise<void>;
  has(key: Key): Promise<boolean>;
  getOrSet(
    key: Key,
    produce: () => MaybePromise<Value>,
    options?: CacheOperationOptions,
  ): Promise<Value>;
}

export type CacheNumericClient<Key, Value extends number> = {
  increment(key: Key, delta?: number, options?: CacheOperationOptions): Promise<Value>;
};

/** Numeric increment is intentionally absent from non-numeric value contracts. */
export type CacheClient<Key, Value> = CacheClientBase<Key, Value> &
  ([Value] extends [number] ? CacheNumericClient<Key, Value> : object);

export interface CacheBridgeOptions {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
}

export interface CacheInvocationBridge {
  readonly run: <A>(operation: () => MaybePromise<A>, options?: CacheBridgeOptions) => Promise<A>;
}

export interface CacheObservedEdge {
  readonly relationship: "uses-cache";
  readonly from: string;
  readonly to: string;
}

export interface CacheOperationObservation {
  readonly capability: "cache";
  readonly operation: CacheOperation;
  readonly ownerId: string;
  readonly cacheId: string;
  readonly outcome: CacheOperationOutcome;
}

export interface CacheDescriptorPolicy {
  readonly key?: StandardSchemaV1;
  readonly value?: StandardSchemaV1;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}

export interface CacheClientOptions<
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly ownerId: string;
  readonly cacheId: string;
  readonly source: unknown;
  readonly keySchema?: KeySchema;
  readonly valueSchema?: ValueSchema;
  readonly key?: KeySchema;
  readonly value?: ValueSchema;
  readonly descriptor?: CacheDescriptorPolicy;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly bridge?: CacheInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly declared?: boolean;
  readonly onObservedEdge?: (edge: CacheObservedEdge) => void;
  readonly onOperation?: (operation: CacheOperationObservation) => void;
}

export class CacheCapabilityError extends Error {
  readonly code = "ZSYS_CACHE_CAPABILITY_UNSUPPORTED" as const;

  constructor(
    readonly capability: CacheCapability,
    readonly operation: CacheOperation,
  ) {
    super(`Cache operation "${operation}" requires unsupported capability "${capability}"`);
    this.name = "CacheCapabilityError";
  }
}

export class CacheDependencyError extends Error {
  readonly code = "ZSYS_CACHE_DEPENDENCY_UNDECLARED" as const;

  constructor(cacheId: string) {
    super(`Cache dependency "${cacheId}" is not declared on this function`);
    this.name = "CacheDependencyError";
  }
}

export class CacheProviderError extends Error {
  readonly code = "ZSYS_CACHE_PROVIDER_UNAVAILABLE" as const;

  constructor(operation: CacheOperation) {
    super(`Cache provider does not implement "${operation}"`);
    this.name = "CacheProviderError";
  }
}

export class CacheSchemaValidationError extends TypeError {
  readonly code = "ZSYS_CACHE_SCHEMA_VALIDATION" as const;

  constructor(
    readonly phase: "key" | "value",
    readonly issues: readonly StandardIssue[],
  ) {
    super(`Cache ${phase} validation failed`);
    this.name = "CacheSchemaValidationError";
  }
}

export class CacheTtlPolicyError extends RangeError {
  readonly code = "ZSYS_CACHE_TTL_POLICY" as const;

  constructor(message: string) {
    super(message);
    this.name = "CacheTtlPolicyError";
  }
}

export class CacheIncrementUnsupportedError extends Error {
  readonly code = "ZSYS_CACHE_INCREMENT_UNSUPPORTED" as const;

  constructor() {
    super("Cache increment requires a numeric value contract");
    this.name = "CacheIncrementUnsupportedError";
  }
}

export class CacheOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;

  constructor() {
    super("Cache operation cancelled");
    this.name = "AbortError";
  }
}

export class CacheOperationTimeoutError extends Error {
  readonly code = "ETIMEDOUT" as const;

  constructor() {
    super("Cache operation timed out");
    this.name = "TimeoutError";
  }
}
