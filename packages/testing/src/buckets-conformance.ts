/**
 * Shared bucket provider conformance suite. Every first-party bucket provider (local, S3,
 * Cloudflare R2) runs these cases, and provider authors run the same ones.
 */
import type { BucketOperation, BucketOperationContext } from "relkit/buckets";
import type {
  BucketsConformanceCase,
  BucketsConformanceCaseId,
  BucketsConformanceOptions,
  BucketsConformanceProvider,
} from "./buckets-conformance.types.js";
import type { ConformanceHarness } from "./conformance.types.js";
import { abortedSignal, check, conformanceHarness, rejects, same, SKIPPED } from "./conformance.js";

export type * from "./buckets-conformance.types.js";

/** The cases every bucket provider passes. */
export const BUCKETS_CONFORMANCE_CASES: readonly BucketsConformanceCase[] = Object.freeze([
  { id: "round-trip", description: "bytes round-trip and missing objects read as undefined" },
  { id: "metadata", description: "head reports size, content type, metadata and an etag" },
  { id: "overwrite", description: "a second put replaces the object and its etag" },
  { id: "list-prefix", description: "list returns every key under a prefix, nested ones too" },
  { id: "delete", description: "delete removes the object and tolerates a missing key" },
  { id: "signed-urls", description: "signed URL methods match the declared capabilities" },
  { id: "cancellation", description: "an aborted operation rejects" },
  { id: "closed", description: "operations reject after close" },
  { id: "backend-failure", description: "a failing backend rejects instead of reporting a miss" },
]);

const encoder = new TextEncoder();

/**
 * Creates the bucket conformance harness for one provider.
 * @param options - Provider factory and optional failing provider.
 * @returns Cases and a runner; pass it to `runConformance` or run each case as a test.
 * @example
 * ```ts
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createBucketsConformanceHarness } from "@relkit/testing/buckets-conformance";
 * import { createLocalBucketProvider } from "relkit/providers-local";
 *
 * const harness = createBucketsConformanceHarness({
 *   create: () => createLocalBucketProvider({ root: "/tmp/relkit-bucket-conformance" }),
 * });
 * console.log((await runConformance(harness)).passed);
 * ```
 */
export function createBucketsConformanceHarness(
  options: BucketsConformanceOptions,
): ConformanceHarness<BucketsConformanceCaseId> {
  const run = `conformance-${Math.random().toString(36).slice(2, 10)}`;
  const withProvider =
    (
      caseId: string,
      body: (bucket: Bucket, prefix: string) => Promise<void | "skipped">,
    ): (() => Promise<void | "skipped">) =>
    async () => {
      const prefix = `${run}/${caseId}`;
      const provider = options.create(prefix);
      await provider.ready?.();
      try {
        return await body(complete(provider), prefix);
      } finally {
        await provider.close?.();
      }
    };
  return conformanceHarness("buckets", BUCKETS_CONFORMANCE_CASES, {
    "round-trip": withProvider("round-trip", async (bucket, prefix) => {
      const key = `${prefix}/one.txt`;
      check((await bucket.get(key)) === undefined, "a missing object reads as undefined");
      check((await bucket.head(key)) === undefined, "a missing object has no metadata");
      check((await bucket.exists(key)) === false, "a missing object does not exist");
      const bytes = encoder.encode("hello conformance");
      await bucket.put(key, bytes);
      check(same(await bucket.get(key), bytes), "bytes round-trip", await bucket.get(key));
      check((await bucket.exists(key)) === true, "the object exists after put");
    }),
    metadata: withProvider("metadata", async (bucket, prefix) => {
      const key = `${prefix}/report.txt`;
      const bytes = encoder.encode("report");
      await bucket.put(key, bytes, { contentType: "text/plain", metadata: { owner: "suite" } });
      const head = await bucket.head(key);
      check(head !== undefined && head.etag.length > 0, "head returns an etag", head);
      check(!head.etag.includes('"'), "the etag carries no quotes", head.etag);
      check(head.size === undefined || head.size === bytes.byteLength, "size", head.size);
      check(head.contentType === "text/plain", "content type", head.contentType);
      check(same(head.metadata ?? {}, { owner: "suite" }), "custom metadata", head.metadata);
    }),
    overwrite: withProvider("overwrite", async (bucket, prefix) => {
      const key = `${prefix}/value.txt`;
      await bucket.put(key, encoder.encode("first"));
      const first = await bucket.head(key);
      await bucket.put(key, encoder.encode("second value"));
      check(same(await bucket.get(key), encoder.encode("second value")), "the second put wins");
      const second = await bucket.head(key);
      check(first?.etag !== second?.etag, "the etag changes with the content", [first, second]);
    }),
    "list-prefix": withProvider("list-prefix", async (bucket, prefix) => {
      const bytes = encoder.encode("x");
      await bucket.put(`${prefix}/reports/one.txt`, bytes);
      await bucket.put(`${prefix}/reports/nested/two.txt`, bytes);
      await bucket.put(`${prefix}/other.txt`, bytes);
      const reports = [...(await bucket.list(`${prefix}/reports/`))].sort();
      const expected = [`${prefix}/reports/nested/two.txt`, `${prefix}/reports/one.txt`];
      check(same(reports, expected), "list returns the keys under the prefix", reports);
      check((await bucket.list(`${prefix}/`)).length === 3, "list includes nested keys");
    }),
    delete: withProvider("delete", async (bucket, prefix) => {
      const key = `${prefix}/gone.txt`;
      await bucket.put(key, encoder.encode("gone"));
      await bucket.delete(key);
      check((await bucket.exists(key)) === false, "the object is gone after delete");
      check((await bucket.get(key)) === undefined, "get is undefined after delete");
      await bucket.delete(`${prefix}/never-written.txt`);
    }),
    "signed-urls": withProvider("signed-urls", async (bucket, prefix) => {
      const flags = capabilities(bucket.capabilities);
      if (!flags.signedReadUrl && !flags.signedWriteUrl) return SKIPPED;
      const key = `${prefix}/signed.txt`;
      if (flags.signedReadUrl) check(isUrl(await bucket.createReadUrl(key)), "a read URL");
      if (flags.signedWriteUrl) check(isUrl(await bucket.createWriteUrl(key)), "a write URL");
    }),
    cancellation: withProvider("cancellation", async (bucket, prefix) => {
      await rejects(() => bucket.get(`${prefix}/a`, aborted("get")), "get with an aborted signal");
      await rejects(
        () => bucket.put(`${prefix}/a`, encoder.encode("a"), undefined, aborted("put")),
        "put with an aborted signal",
      );
    }),
    closed: async () => {
      const provider = options.create(`${run}/closed`);
      await provider.ready?.();
      if (provider.close === undefined) return SKIPPED;
      await provider.close();
      await rejects(async () => provider.get?.(`${run}/closed/a`), "get after close");
    },
    "backend-failure": async () => {
      if (options.failing === undefined) return SKIPPED;
      const provider = options.failing();
      try {
        await rejects(async () => provider.get?.(`${run}/failing/a`), "get on a failing backend");
        await rejects(
          async () => provider.put?.(`${run}/failing/a`, encoder.encode("a")),
          "put on a failing backend",
        );
      } finally {
        await provider.close?.().catch(() => undefined);
      }
    },
  });
}

type Bucket = {
  readonly [K in Exclude<keyof BucketsConformanceProvider, "capabilities">]-?: NonNullable<
    BucketsConformanceProvider[K]
  >;
} & { readonly capabilities: BucketsConformanceProvider["capabilities"] };

function capabilities(value: BucketsConformanceProvider["capabilities"]) {
  if (Array.isArray(value))
    return {
      signedReadUrl: value.includes("signedReadUrl"),
      signedWriteUrl: value.includes("signedWriteUrl"),
    };
  const flags = value as { signedReadUrl?: boolean; signedWriteUrl?: boolean } | undefined;
  return {
    signedReadUrl: flags?.signedReadUrl === true,
    signedWriteUrl: flags?.signedWriteUrl === true,
  };
}

function isUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol.length > 0;
  } catch {
    return false;
  }
}

function aborted(operation: BucketOperation): BucketOperationContext {
  return { operation, signal: abortedSignal() };
}

/** Gives every optional method a body that fails the case when the provider lacks it. */
function complete(provider: BucketsConformanceProvider): Bucket {
  const names = ["put", "get", "head", "delete", "exists", "list", "createReadUrl"] as const;
  const methods: Record<string, unknown> = {};
  for (const name of [...names, "createWriteUrl", "ready", "close"] as const) {
    const method = provider[name];
    methods[name] =
      typeof method === "function"
        ? (method as (...args: unknown[]) => unknown).bind(provider)
        : () => {
            throw new Error(`The provider has no ${name} method`);
          };
  }
  return { ...methods, capabilities: provider.capabilities } as Bucket;
}
