/** Inputs of the shared bucket provider conformance suite. */
import type { BucketPolicy, BucketProvider } from "relkit/buckets";
import type { ConformanceCase } from "./conformance.types.js";

/** A bucket provider under test, with the optional lifecycle methods first-party providers have. */
export type BucketsConformanceProvider = BucketProvider & {
  readonly ready?: () => Promise<unknown>;
  readonly close?: () => Promise<unknown>;
};

/** What a bucket provider supplies to run the suite. */
export interface BucketsConformanceOptions {
  /**
   * Creates a provider for one case. Cases write only under the key prefix they pass, so one
   * bucket can serve every case.
   * @param prefix - Unique key prefix for the case, without a trailing slash.
   */
  readonly create: (prefix: string) => BucketsConformanceProvider;
  /**
   * Failure injection: creates a provider whose backend cannot answer (an unreachable endpoint, a
   * missing binding, a failing `fetch`). The `backend-failure` case is skipped without it.
   */
  readonly failing?: () => BucketsConformanceProvider;
  /**
   * Creates a provider that applies the given bucket limits. The `policy` and
   * `signed-upload-limits` cases are skipped without it.
   * @param prefix - Unique key prefix for the case, without a trailing slash.
   * @param policy - Limits the provider must apply, as a bucket declares them.
   */
  readonly limited?: (prefix: string, policy: BucketPolicy) => BucketsConformanceProvider;
  /**
   * Sends the uploads of the `signed-upload-limits` case to a signed URL; defaults to the global
   * `fetch`.
   */
  readonly upload?: typeof globalThis.fetch;
}

/** Case ids of the bucket suite. */
export type BucketsConformanceCaseId =
  | "round-trip"
  | "metadata"
  | "overwrite"
  | "list-prefix"
  | "delete"
  | "signed-urls"
  | "cancellation"
  | "closed"
  | "backend-failure"
  | "policy"
  | "signed-upload-limits";

/** One bucket conformance case. */
export type BucketsConformanceCase = ConformanceCase<BucketsConformanceCaseId>;
