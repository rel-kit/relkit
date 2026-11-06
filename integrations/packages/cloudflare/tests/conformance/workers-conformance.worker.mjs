// The Workers conformance Worker: served by `wrangler dev` (workerd) with a local KV namespace
// (CACHE), a local R2 bucket (UPLOADS) and an HTTP Redis endpoint (REDIS_HTTP_URL), it runs the
// published `@relkit/testing` cache, bucket and realtime suites against the Workers-compatible
// providers inside the Workers runtime and answers with one result per check, each with its cases.
// `@relkit/redis/runtime` is aliased to the built package by the test's wrangler configuration.
import { strict as assert } from "node:assert";
import { createRedisCacheProvider, createRedisClient } from "@relkit/redis/runtime";
import { detectRuntime } from "relkit/runtime";
import {
  createCloudflareKvBindingCacheProvider,
  createCloudflareR2BindingBucketProvider,
  createDurableObjectRealtimeProvider,
} from "../../dist/runtime/index.js";
import { createBucketsConformanceHarness } from "@relkit/testing/buckets-conformance";
import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
import { assertConformance, runConformance } from "@relkit/testing/conformance";
import { createRealtimeConformanceHarness } from "@relkit/testing/realtime-conformance";
import { checkRedisProtocol } from "../../../redis/tests/conformance/redis-protocol-checks.mjs";

// The Durable Object class the realtime provider's namespace binding names.
export { RelkitRealtimeState } from "../../dist/workers/index.js";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/ready") return new Response("ready");
    // The generated Workers entry stores `env` here; providers read their bindings from it.
    globalThis[Symbol.for("relkit.workers.bindings")] = env;
    const prefix = `workers-${crypto.randomUUID()}`;
    const results = [];
    const run = async (name, check) => {
      try {
        const cases = await check();
        results.push({ name, ok: true, ...(cases === undefined ? {} : { cases }) });
      } catch (error) {
        results.push({ name, ok: false, error: String(error?.stack ?? error) });
      }
    };
    const suite = async (harness) => {
      const report = await runConformance(harness);
      assertConformance(report);
      return Object.fromEntries(report.results.map((result) => [result.id, result.outcome]));
    };
    const redis = { createRedisClient, createRedisCacheProvider };
    const url = env.REDIS_HTTP_URL;
    await run("runtime is workers", () => assert.equal(detectRuntime(), "workers"));
    await run("redis over HTTP: protocol", () =>
      checkRedisProtocol(redis, { url, prefix, unreachable: "http://127.0.0.1:1" }),
    );
    await run("redis over HTTP: cache", () =>
      suite(
        createCacheConformanceHarness({
          create: (cacheId) => createRedisCacheProvider({ url, cacheId }),
          failing: () => createRedisCacheProvider({ url: "http://127.0.0.1:1", cacheId: prefix }),
        }),
      ),
    );
    await run("redis socket URL is refused on Workers", () =>
      assert.throws(
        () => createRedisClient({ url: "redis://127.0.0.1:6379" }),
        /cannot open a Redis socket/,
      ),
    );
    await run("KV binding: cache", () =>
      suite(
        createCacheConformanceHarness({
          create: (cacheId) =>
            createCloudflareKvBindingCacheProvider({ binding: "CACHE", cacheId }),
          failing: () =>
            createCloudflareKvBindingCacheProvider({ binding: "MISSING", cacheId: prefix }),
          minTtlMs: 60_000,
        }),
      ),
    );
    await run("R2 binding: bucket", () =>
      suite(
        createBucketsConformanceHarness({
          create: () => createCloudflareR2BindingBucketProvider({ binding: "UPLOADS" }),
          failing: () => createCloudflareR2BindingBucketProvider({ binding: "MISSING" }),
        }),
      ),
    );
    await run("Durable Object realtime: two providers share one channel", async () => {
      const create = (profile) =>
        createDurableObjectRealtimeProvider({ binding: "RELKIT_REALTIME", profile });
      assert.equal(create(prefix).capabilities.durability, "durable-object");
      return suite(
        createRealtimeConformanceHarness({
          create,
          failing: () =>
            createDurableObjectRealtimeProvider({ binding: "MISSING", profile: prefix }),
        }),
      );
    });
    await run("missing binding names itself", () =>
      assert.rejects(
        createCloudflareKvBindingCacheProvider({ binding: "MISSING", cacheId: prefix }).get("k"),
        /no binding named MISSING/,
      ),
    );
    return Response.json({ runtime: navigator.userAgent, results });
  },
};
