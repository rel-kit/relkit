import type { DependencyCategory, DependencyClientSources } from "@relkit/engine";
import type { TestBucketFake, TestBucketFakeOptions } from "./buckets.js";
import type { TestCacheFake, TestCacheFakeOptions } from "./cache.js";
import type { TestProviderReplacements } from "./provider-replacements.js";

/** Owner-local native failure injection with explicit one-shot and persistent boundaries. */
export interface TestFailureControls {
  readonly failAt: (point: string, cause?: unknown) => void;
  readonly once?: (point: string, cause?: unknown) => void;
  readonly clear: (point?: string) => void;
  readonly check: (point: string) => void;
}

/** Explicit clock, logger and provider replacement policy for one fake owner. */
export interface TestFakesOptions {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly clock?: () => number;
  readonly providers?: TestProviderReplacements;
}

/** Owned native dependency sources and authoritative writable storage fixtures. */
export interface TestFakes {
  readonly stateRoot: string;
  readonly clients: DependencyClientSources;
  readonly buckets: Readonly<Record<string, TestBucketFake>>;
  readonly cache: Readonly<Record<string, TestCacheFake<unknown, unknown>>>;
  readonly providers: TestProviderReplacements;
  readonly createBucket: (
    id: string,
    options?: Omit<TestBucketFakeOptions, "bucketId" | "stateRoot" | "failures" | "clock">,
  ) => TestBucketFake;
  readonly createCache: (
    id: string,
    options?: Omit<TestCacheFakeOptions, "cacheId" | "stateRoot" | "failures" | "clock">,
  ) => TestCacheFake<unknown, unknown>;
  readonly setClient: (category: DependencyCategory, name: string, client: unknown) => void;
  readonly removeClient: (category: DependencyCategory, name: string) => void;
  readonly failures: TestFailureControls;
  readonly close: () => Promise<void>;
}
